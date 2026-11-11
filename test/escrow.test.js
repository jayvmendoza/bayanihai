const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const PRICE = 70n; // wei per kg (tiny numbers keep the math readable)
const FARMER_PRICE = 45n;
const HOUR = 3600;

async function now() {
  return (await ethers.provider.getBlock("latest")).timestamp;
}
async function travel(seconds) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}

describe("BayanihaiEscrow", () => {
  let escrow, agent, farmer, hauler, coordinator, buyerA, buyerB, stranger;

  async function createDeal(targetKg = 10n) {
    const t = await now();
    await escrow
      .connect(agent)
      .createDeal(farmer, hauler, coordinator, PRICE, FARMER_PRICE, targetKg, t + HOUR, t + 2 * HOUR);
    return escrow.dealCount();
  }

  beforeEach(async () => {
    [agent, farmer, hauler, coordinator, buyerA, buyerB, stranger] = await ethers.getSigners();
    escrow = await ethers.deployContract("BayanihaiEscrow", [agent.address]);
  });

  it("only the AI agent can create deals", async () => {
    const t = await now();
    await expect(
      escrow
        .connect(stranger)
        .createDeal(farmer, hauler, coordinator, PRICE, FARMER_PRICE, 10, t + HOUR, t + 2 * HOUR)
    ).to.be.revertedWithCustomError(escrow, "NotAgent");
  });

  it("locks buyer money and marks the deal Funded when the target is reached", async () => {
    const id = await createDeal(10n);
    await escrow.connect(buyerA).joinDeal(id, 6, { value: 6n * PRICE });
    expect((await escrow.deals(id)).status).to.equal(0n); // Open
    await escrow.connect(buyerB).joinDeal(id, 4, { value: 4n * PRICE });
    expect((await escrow.deals(id)).status).to.equal(1n); // Funded
    expect(await ethers.provider.getBalance(escrow)).to.equal(10n * PRICE);
  });

  it("rejects wrong payment amounts and over-target orders", async () => {
    const id = await createDeal(10n);
    await expect(escrow.connect(buyerA).joinDeal(id, 2, { value: PRICE })).to.be.revertedWithCustomError(
      escrow,
      "WrongAmount"
    );
    await expect(
      escrow.connect(buyerA).joinDeal(id, 11, { value: 11n * PRICE })
    ).to.be.revertedWithCustomError(escrow, "OverTarget");
  });

  it("pays farmer and hauler when the coordinator confirms delivery", async () => {
    const id = await createDeal(10n);
    await escrow.connect(buyerA).joinDeal(id, 10, { value: 10n * PRICE });

    await expect(escrow.connect(buyerA).confirmDelivery(id)).to.be.revertedWithCustomError(escrow, "NotCoordinator");
    await expect(escrow.connect(coordinator).confirmDelivery(id)).to.changeEtherBalances(
      [farmer, hauler, escrow],
      [10n * FARMER_PRICE, 10n * (PRICE - FARMER_PRICE), -10n * PRICE]
    );
    expect((await escrow.deals(id)).status).to.equal(2n); // Released
  });

  it("the agent cannot release money", async () => {
    const id = await createDeal(10n);
    await escrow.connect(buyerA).joinDeal(id, 10, { value: 10n * PRICE });
    await expect(escrow.connect(agent).confirmDelivery(id)).to.be.revertedWithCustomError(escrow, "NotCoordinator");
  });

  it("refunds buyers when the group does not fill before the deadline", async () => {
    const id = await createDeal(10n);
    await escrow.connect(buyerA).joinDeal(id, 3, { value: 3n * PRICE });
    await expect(escrow.connect(buyerA).claimRefund(id)).to.be.revertedWithCustomError(escrow, "NotRefundable");

    await travel(HOUR + 1);
    await expect(escrow.connect(buyerA).claimRefund(id)).to.changeEtherBalance(buyerA, 3n * PRICE);
    await expect(escrow.connect(buyerA).claimRefund(id)).to.be.revertedWithCustomError(escrow, "NothingToRefund");
    await expect(escrow.connect(stranger).claimRefund(id)).to.be.revertedWithCustomError(escrow, "NothingToRefund");
  });

  it("refunds buyers when delivery is never confirmed", async () => {
    const id = await createDeal(10n);
    await escrow.connect(buyerA).joinDeal(id, 10, { value: 10n * PRICE });
    await travel(2 * HOUR + 1);
    await expect(escrow.connect(coordinator).confirmDelivery(id)).to.be.revertedWithCustomError(
      escrow,
      "DeadlinePassed"
    );
    await expect(escrow.connect(buyerA).claimRefund(id)).to.changeEtherBalance(buyerA, 10n * PRICE);
  });
});
