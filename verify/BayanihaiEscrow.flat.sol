// Sources flattened with hardhat v2.29.2 https://hardhat.org

// SPDX-License-Identifier: MIT

// File contracts/BayanihaiEscrow.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.24;

/// @title BAYANIHAI group-buying escrow (v2)
/// @notice Every buyer payment goes to ONE place: this contract. The money stays here, safe for both sides,
///         until the farmer delivers AND the buyer side confirms it was received.
///         - The AI agent can only CREATE deals. It can never move money.
///         - Buyers lock payment with joinDeal(). GCash/cash payments carry a proof fingerprint that can be used once.
///         - The farmer marks the harvest delivered; a buyer (or the barangay coordinator) confirms receipt -> paid out.
///         - If nobody confirms, the farmer can claim after the confirm window, unless a buyer raised a dispute.
///         - If the group doesn't fill, or the farmer never delivers, buyers pull their own refunds.
contract BayanihaiEscrow {
    enum Status {
        Open, // accepting buyer payments
        Funded, // target reached, waiting for the farmer to deliver
        Delivered, // farmer says delivered, waiting for the buyer side to confirm
        Disputed, // a buyer says it didn't arrive; the coordinator decides
        Released, // paid out to farmer + hauler
        Refunded // buyers can claim their money back
    }

    enum Method {
        Wallet, // paid directly from a crypto wallet
        GCash, // paid in pesos via e-wallet; proof = fingerprint of the receipt reference
        Cash // paid in cash to the coordinator; proof = fingerprint of the cash record
    }

    struct Deal {
        address farmer;
        address hauler;
        address coordinator; // barangay coordinator for the pickup point
        uint256 pricePerKg; // what buyers pay per kg (wei)
        uint256 farmerPricePerKg; // farmer's share per kg (wei); the rest goes to the hauler
        uint256 targetKg;
        uint256 fundedKg;
        uint256 fundingDeadline; // group must fill before this
        uint256 deliveryDeadline; // farmer must deliver before this
        uint256 confirmWindow; // seconds buyers have to confirm or dispute after delivery
        uint256 deliveredAt;
        Status status;
    }

    address public immutable agent; // the AI Deal Maker's wallet
    uint256 public dealCount;
    mapping(uint256 => Deal) public deals;
    mapping(uint256 => mapping(address => uint256)) public kgOf;
    mapping(bytes32 => bool) public proofUsed; // a payment proof (e.g. a GCash receipt) can back only one payment, ever

    event DealCreated(uint256 indexed dealId, address indexed farmer, uint256 targetKg, uint256 pricePerKg);
    event Joined(uint256 indexed dealId, address indexed buyer, uint256 kg, uint256 amount, Method method, bytes32 proof);
    event Funded(uint256 indexed dealId);
    event Delivered(uint256 indexed dealId, uint256 confirmBy);
    event ReceiptConfirmed(uint256 indexed dealId, address indexed by);
    event Disputed(uint256 indexed dealId, address indexed by);
    event DisputeResolved(uint256 indexed dealId, bool paidFarmer);
    event Released(uint256 indexed dealId, uint256 toFarmer, uint256 toHauler);
    event Refunded(uint256 indexed dealId, address indexed buyer, uint256 amount);

    error NotAgent();
    error NotFarmer();
    error NotCoordinator();
    error NotBuyerOrCoordinator();
    error NotBuyer();
    error BadParams();
    error WrongStatus();
    error DeadlinePassed();
    error TooEarly();
    error WrongAmount();
    error OverTarget();
    error ProofAlreadyUsed();
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
        uint256 deliveryDeadline,
        uint256 confirmWindow
    ) external returns (uint256 dealId) {
        if (msg.sender != agent) revert NotAgent();
        if (
            farmer == address(0) || hauler == address(0) || coordinator == address(0) || targetKg == 0
                || farmerPricePerKg == 0 || farmerPricePerKg > pricePerKg || fundingDeadline <= block.timestamp
                || deliveryDeadline <= fundingDeadline || confirmWindow == 0
        ) revert BadParams();

        dealId = ++dealCount;
        Deal storage d = deals[dealId];
        d.farmer = farmer;
        d.hauler = hauler;
        d.coordinator = coordinator;
        d.pricePerKg = pricePerKg;
        d.farmerPricePerKg = farmerPricePerKg;
        d.targetKg = targetKg;
        d.fundingDeadline = fundingDeadline;
        d.deliveryDeadline = deliveryDeadline;
        d.confirmWindow = confirmWindow;
        d.status = Status.Open;
        emit DealCreated(dealId, farmer, targetKg, pricePerKg);
    }

    /// @notice Buyer locks payment for `kg` kilos. The money stays in this contract.
    /// @param method How the buyer paid. GCash and Cash need a proof fingerprint, and each proof works only once.
    function joinDeal(uint256 dealId, uint256 kg, Method method, bytes32 proof) external payable {
        Deal storage d = deals[dealId];
        if (d.status != Status.Open) revert WrongStatus();
        if (block.timestamp >= d.fundingDeadline) revert DeadlinePassed();
        if (kg == 0 || msg.value != kg * d.pricePerKg) revert WrongAmount();
        if (d.fundedKg + kg > d.targetKg) revert OverTarget();
        if (method != Method.Wallet && proof == bytes32(0)) revert BadParams();
        if (proof != bytes32(0)) {
            if (proofUsed[proof]) revert ProofAlreadyUsed();
            proofUsed[proof] = true;
        }

        d.fundedKg += kg;
        kgOf[dealId][msg.sender] += kg;
        emit Joined(dealId, msg.sender, kg, msg.value, method, proof);

        if (d.fundedKg == d.targetKg) {
            d.status = Status.Funded;
            emit Funded(dealId);
        }
    }

    /// @notice The farmer says the harvest was delivered. The money is NOT released yet.
    function markDelivered(uint256 dealId) external {
        Deal storage d = deals[dealId];
        if (msg.sender != d.farmer) revert NotFarmer();
        if (d.status != Status.Funded) revert WrongStatus();
        if (block.timestamp >= d.deliveryDeadline) revert DeadlinePassed();
        d.status = Status.Delivered;
        d.deliveredAt = block.timestamp;
        emit Delivered(dealId, block.timestamp + d.confirmWindow);
    }

    /// @notice A buyer in this deal (or the barangay coordinator) confirms the produce arrived -> farmer and hauler are paid.
    function confirmReceived(uint256 dealId) external {
        Deal storage d = deals[dealId];
        if (d.status != Status.Delivered) revert WrongStatus();
        if (msg.sender != d.coordinator && kgOf[dealId][msg.sender] == 0) revert NotBuyerOrCoordinator();
        emit ReceiptConfirmed(dealId, msg.sender);
        _release(dealId);
    }

    /// @notice A buyer says the produce did not arrive (only during the confirm window). The coordinator decides.
    function dispute(uint256 dealId) external {
        Deal storage d = deals[dealId];
        if (d.status != Status.Delivered) revert WrongStatus();
        if (kgOf[dealId][msg.sender] == 0) revert NotBuyer();
        if (block.timestamp >= d.deliveredAt + d.confirmWindow) revert DeadlinePassed();
        d.status = Status.Disputed;
        emit Disputed(dealId, msg.sender);
    }

    /// @notice The coordinator settles a dispute: pay the farmer, or let every buyer claim a refund.
    function resolveDispute(uint256 dealId, bool payFarmer) external {
        Deal storage d = deals[dealId];
        if (msg.sender != d.coordinator) revert NotCoordinator();
        if (d.status != Status.Disputed) revert WrongStatus();
        emit DisputeResolved(dealId, payFarmer);
        if (payFarmer) _release(dealId);
        else d.status = Status.Refunded;
    }

    /// @notice If nobody confirmed or disputed within the window, the farmer gets paid (anyone can trigger it).
    function claimAfterWindow(uint256 dealId) external {
        Deal storage d = deals[dealId];
        if (d.status != Status.Delivered) revert WrongStatus();
        if (block.timestamp < d.deliveredAt + d.confirmWindow) revert TooEarly();
        _release(dealId);
    }

    /// @notice Refundable if the group didn't fill in time, the farmer never delivered in time, or a dispute ended in a refund.
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

    function _release(uint256 dealId) private {
        Deal storage d = deals[dealId];
        d.status = Status.Released;
        uint256 toFarmer = d.fundedKg * d.farmerPricePerKg;
        uint256 toHauler = d.fundedKg * d.pricePerKg - toFarmer;
        _send(d.farmer, toFarmer);
        if (toHauler > 0) _send(d.hauler, toHauler);
        emit Released(dealId, toFarmer, toHauler);
    }

    function _send(address to, uint256 amount) private {
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
