const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const PRICE = 70n; // wei per kg (tiny numbers keep the math readable)
const FARMER_PRICE = 45n;
const HOUR = 3600;
const WINDOW = 600; // seconds buyers have to confirm or dispute after delivery
const Status = { Open: 0n, Funded: 1n, Delivered: 2n, Disputed: 3n, Released: 4n, Refunded: 5n };
const Method = { Wallet: 0, GCash: 1, Cash: 2 };
const NO_PROOF = ethers.ZeroHash;
const proof = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));

async function now() {
  return (await ethers.provider.getBlock("latest")).timestamp;
}
async function travel(seconds) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}

describe("BayanihaiEscrow v2", () => {
  let escrow, agent, farmer, hauler, coordinator, buyerA, buyerB, stranger;

  async function createDeal(targetKg = 10n) {
    const t = await now();
    await escrow.connect(agent).createDeal(farmer, hauler, coordinator, PRICE, FARMER_PRICE, targetKg, t + HOUR, t + 2 * HOUR, WINDOW);
    return escrow.dealCount();
  }
  async function fundedDeal() {
    const id = await createDeal(10n);
    await escrow.connect(buyerA).joinDeal(id, 6, Method.Wallet, NO_PROOF, { value: 6n * PRICE });
    await escrow.connect(buyerB).joinDeal(id, 4, Method.GCash, proof("gcash-ref-1"), { value: 4n * PRICE });
    return id;
  }
  async function deliveredDeal() {
    const id = await fundedDeal();
    await escrow.connect(farmer).markDelivered(id);
    return id;
  }
  const status = async (id) => (await escrow.deals(id)).status;

  beforeEach(async () => {
    [agent, farmer, hauler, coordinator, buyerA, buyerB, stranger] = await ethers.getSigners();
    escrow = await ethers.deployContract("BayanihaiEscrow", [agent.address]);
  });

  it("only the AI agent can create deals", async () => {
    const t = await now();
    await expect(
      escrow.connect(stranger).createDeal(farmer, hauler, coordinator, PRICE, FARMER_PRICE, 10, t + HOUR, t + 2 * HOUR, WINDOW)
    ).to.be.revertedWithCustomError(escrow, "NotAgent");
  });

  it("all buyer money goes to the escrow and the deal is Funded at the target", async () => {
    const id = await createDeal(10n);
    await escrow.connect(buyerA).joinDeal(id, 6, Method.Wallet, NO_PROOF, { value: 6n * PRICE });
    expect(await status(id)).to.equal(Status.Open);
    await escrow.connect(buyerB).joinDeal(id, 4, Method.Cash, proof("cash-1"), { value: 4n * PRICE });
    expect(await status(id)).to.equal(Status.Funded);
    expect(await ethers.provider.getBalance(escrow)).to.equal(10n * PRICE);
  });

  it("records the payment method and proof, and a proof can be used only once", async () => {
    const id = await createDeal(10n);
    const p = proof("gcash-ref-777");
    await expect(escrow.connect(buyerA).joinDeal(id, 2, Method.GCash, p, { value: 2n * PRICE }))
      .to.emit(escrow, "Joined")
      .withArgs(id, buyerA.address, 2, 2n * PRICE, Method.GCash, p);
    await expect(escrow.connect(buyerB).joinDeal(id, 2, Method.GCash, p, { value: 2n * PRICE })).to.be.revertedWithCustomError(
      escrow,
      "ProofAlreadyUsed"
    );
    await expect(escrow.connect(buyerB).joinDeal(id, 2, Method.GCash, NO_PROOF, { value: 2n * PRICE })).to.be.revertedWithCustomError(
      escrow,
      "BadParams"
    );
  });

  it("rejects wrong amounts and over-target orders", async () => {
    const id = await createDeal(10n);
    await expect(escrow.connect(buyerA).joinDeal(id, 2, Method.Wallet, NO_PROOF, { value: PRICE })).to.be.revertedWithCustomError(escrow, "WrongAmount");
    await expect(escrow.connect(buyerA).joinDeal(id, 11, Method.Wallet, NO_PROOF, { value: 11n * PRICE })).to.be.revertedWithCustomError(escrow, "OverTarget");
  });

  it("money stays locked when the farmer marks delivered; only the farmer can mark it", async () => {
    const id = await fundedDeal();
    await expect(escrow.connect(stranger).markDelivered(id)).to.be.revertedWithCustomError(escrow, "NotFarmer");
    await expect(escrow.connect(farmer).markDelivered(id)).to.changeEtherBalance(escrow, 0);
    expect(await status(id)).to.equal(Status.Delivered);
  });

  it("a buyer confirming receipt pays the farmer and hauler", async () => {
    const id = await deliveredDeal();
    await expect(escrow.connect(stranger).confirmReceived(id)).to.be.revertedWithCustomError(escrow, "NotBuyerOrCoordinator");
    await expect(escrow.connect(buyerB).confirmReceived(id)).to.changeEtherBalances(
      [farmer, hauler, escrow],
      [10n * FARMER_PRICE, 10n * (PRICE - FARMER_PRICE), -10n * PRICE]
    );
    expect(await status(id)).to.equal(Status.Released);
  });

  it("the coordinator can confirm receipt for the pickup group", async () => {
    const id = await deliveredDeal();
    await expect(escrow.connect(coordinator).confirmReceived(id)).to.changeEtherBalance(farmer, 10n * FARMER_PRICE);
  });

  it("cannot confirm receipt before the farmer marks delivered", async () => {
    const id = await fundedDeal();
    await expect(escrow.connect(buyerA).confirmReceived(id)).to.be.revertedWithCustomError(escrow, "WrongStatus");
  });

  it("the AI agent can never release money", async () => {
    const id = await deliveredDeal();
    await expect(escrow.connect(agent).confirmReceived(id)).to.be.revertedWithCustomError(escrow, "NotBuyerOrCoordinator");
    await expect(escrow.connect(agent).claimRefund(id)).to.be.revertedWithCustomError(escrow, "NotRefundable");
  });

  it("farmer is paid after the confirm window if nobody confirms or disputes", async () => {
    const id = await deliveredDeal();
    await expect(escrow.connect(farmer).claimAfterWindow(id)).to.be.revertedWithCustomError(escrow, "TooEarly");
    await travel(WINDOW + 1);
    await expect(escrow.connect(farmer).claimAfterWindow(id)).to.changeEtherBalance(farmer, 10n * FARMER_PRICE);
  });

  it("a dispute blocks the auto-payout; the coordinator can refund the buyers", async () => {
    const id = await deliveredDeal();
    await expect(escrow.connect(stranger).dispute(id)).to.be.revertedWithCustomError(escrow, "NotBuyer");
    await escrow.connect(buyerA).dispute(id);
    expect(await status(id)).to.equal(Status.Disputed);
    await travel(WINDOW + 1);
    await expect(escrow.connect(farmer).claimAfterWindow(id)).to.be.revertedWithCustomError(escrow, "WrongStatus");
    await expect(escrow.connect(buyerA).resolveDispute(id, false)).to.be.revertedWithCustomError(escrow, "NotCoordinator");
    await escrow.connect(coordinator).resolveDispute(id, false);
    await expect(escrow.connect(buyerA).claimRefund(id)).to.changeEtherBalance(buyerA, 6n * PRICE);
    await expect(escrow.connect(buyerB).claimRefund(id)).to.changeEtherBalance(buyerB, 4n * PRICE);
  });

  it("the coordinator can settle a dispute in the farmer's favor", async () => {
    const id = await deliveredDeal();
    await escrow.connect(buyerA).dispute(id);
    await expect(escrow.connect(coordinator).resolveDispute(id, true)).to.changeEtherBalance(farmer, 10n * FARMER_PRICE);
  });

  it("refunds buyers when the group does not fill before the deadline", async () => {
    const id = await createDeal(10n);
    await escrow.connect(buyerA).joinDeal(id, 3, Method.Wallet, NO_PROOF, { value: 3n * PRICE });
    await expect(escrow.connect(buyerA).claimRefund(id)).to.be.revertedWithCustomError(escrow, "NotRefundable");
    await travel(HOUR + 1);
    await expect(escrow.connect(buyerA).claimRefund(id)).to.changeEtherBalance(buyerA, 3n * PRICE);
    await expect(escrow.connect(buyerA).claimRefund(id)).to.be.revertedWithCustomError(escrow, "NothingToRefund");
  });

  it("refunds buyers when the farmer never delivers in time", async () => {
    const id = await fundedDeal();
    await travel(2 * HOUR + 1);
    await expect(escrow.connect(farmer).markDelivered(id)).to.be.revertedWithCustomError(escrow, "DeadlinePassed");
    await expect(escrow.connect(buyerA).claimRefund(id)).to.changeEtherBalance(buyerA, 6n * PRICE);
  });
});
