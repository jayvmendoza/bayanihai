// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BAYANIHAI group-buying escrow
/// @notice The AI agent can only CREATE deals. Money moves only by the rules below:
///         - buyers lock payment with joinDeal()
///         - the delivery coordinator confirms delivery -> farmer (and hauler) get paid
///         - if the group doesn't fill in time, or delivery never happens, buyers claim refunds
contract BayanihaiEscrow {
    enum Status {
        Open, // accepting buyer payments
        Funded, // target reached, waiting for delivery
        Released, // delivered, farmer + hauler paid
        Refunded // failed, buyers can claim refunds
    }

    struct Deal {
        address farmer;
        address hauler;
        address coordinator; // e.g. barangay coordinator who confirms delivery
        uint256 pricePerKg; // what buyers pay per kg (wei)
        uint256 farmerPricePerKg; // farmer's share per kg (wei); the rest goes to the hauler
        uint256 targetKg;
        uint256 fundedKg;
        uint256 fundingDeadline; // group must fill before this
        uint256 deliveryDeadline; // delivery must be confirmed before this
        Status status;
    }

    address public immutable agent; // the AI Deal Maker's wallet
    uint256 public dealCount;
    mapping(uint256 => Deal) public deals;
    mapping(uint256 => mapping(address => uint256)) public kgOf;

    event DealCreated(uint256 indexed dealId, address indexed farmer, uint256 targetKg, uint256 pricePerKg);
    event Joined(uint256 indexed dealId, address indexed buyer, uint256 kg, uint256 amount);
    event Funded(uint256 indexed dealId);
    event Released(uint256 indexed dealId, uint256 toFarmer, uint256 toHauler);
    event Refunded(uint256 indexed dealId, address indexed buyer, uint256 amount);

    error NotAgent();
    error NotCoordinator();
    error BadParams();
    error WrongStatus();
    error DeadlinePassed();
    error WrongAmount();
    error OverTarget();
    error NotRefundable();
    error NothingToRefund();
    error TransferFailed();

    constructor(address _agent) {
        if (_agent == address(0)) revert BadParams();
        agent = _agent;
    }

    /// @notice Only the AI agent can create a deal. It cannot touch any money.
    function createDeal(
        address farmer,
        address hauler,
        address coordinator,
        uint256 pricePerKg,
        uint256 farmerPricePerKg,
        uint256 targetKg,
        uint256 fundingDeadline,
        uint256 deliveryDeadline
    ) external returns (uint256 dealId) {
        if (msg.sender != agent) revert NotAgent();
        if (
            farmer == address(0) || hauler == address(0) || coordinator == address(0) || targetKg == 0
                || farmerPricePerKg == 0 || farmerPricePerKg > pricePerKg || fundingDeadline <= block.timestamp
                || deliveryDeadline <= fundingDeadline
        ) revert BadParams();

        dealId = ++dealCount;
        deals[dealId] = Deal({
            farmer: farmer,
            hauler: hauler,
            coordinator: coordinator,
            pricePerKg: pricePerKg,
            farmerPricePerKg: farmerPricePerKg,
            targetKg: targetKg,
            fundedKg: 0,
            fundingDeadline: fundingDeadline,
            deliveryDeadline: deliveryDeadline,
            status: Status.Open
        });
        emit DealCreated(dealId, farmer, targetKg, pricePerKg);
    }

    /// @notice Buyer locks payment for `kg` kilos. Money stays in this contract.
    function joinDeal(uint256 dealId, uint256 kg) external payable {
        Deal storage d = deals[dealId];
        if (d.status != Status.Open) revert WrongStatus();
        if (block.timestamp >= d.fundingDeadline) revert DeadlinePassed();
        if (kg == 0 || msg.value != kg * d.pricePerKg) revert WrongAmount();
        if (d.fundedKg + kg > d.targetKg) revert OverTarget();

        d.fundedKg += kg;
        kgOf[dealId][msg.sender] += kg;
        emit Joined(dealId, msg.sender, kg, msg.value);

        if (d.fundedKg == d.targetKg) {
            d.status = Status.Funded;
            emit Funded(dealId);
        }
    }

    /// @notice Coordinator confirms delivery -> farmer and hauler are paid.
    function confirmDelivery(uint256 dealId) external {
        Deal storage d = deals[dealId];
        if (msg.sender != d.coordinator) revert NotCoordinator();
        if (d.status != Status.Funded) revert WrongStatus();
        if (block.timestamp >= d.deliveryDeadline) revert DeadlinePassed();

        d.status = Status.Released;
        uint256 toFarmer = d.fundedKg * d.farmerPricePerKg;
        uint256 toHauler = d.fundedKg * d.pricePerKg - toFarmer;

        _send(d.farmer, toFarmer);
        if (toHauler > 0) _send(d.hauler, toHauler);
        emit Released(dealId, toFarmer, toHauler);
    }

    /// @notice A deal is refundable if the group didn't fill in time, or delivery wasn't confirmed in time.
    function isRefundable(uint256 dealId) public view returns (bool) {
        Deal storage d = deals[dealId];
        if (d.status == Status.Refunded) return true;
        if (d.status == Status.Open) return block.timestamp >= d.fundingDeadline;
        if (d.status == Status.Funded) return block.timestamp >= d.deliveryDeadline;
        return false;
    }

    /// @notice Buyer pulls their own refund. Nobody else can move it.
    function claimRefund(uint256 dealId) external {
        if (!isRefundable(dealId)) revert NotRefundable();
        Deal storage d = deals[dealId];
        uint256 kg = kgOf[dealId][msg.sender];
        if (kg == 0) revert NothingToRefund();

        d.status = Status.Refunded;
        kgOf[dealId][msg.sender] = 0;
        uint256 amount = kg * d.pricePerKg;
        _send(msg.sender, amount);
        emit Refunded(dealId, msg.sender, amount);
    }

    function _send(address to, uint256 amount) private {
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
