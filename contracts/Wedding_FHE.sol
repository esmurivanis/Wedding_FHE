pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract WeddingRegistry is ZamaEthereumConfig {
    struct Gift {
        string encryptedMessage;
        euint32 encryptedAmount;
        address sender;
        uint256 timestamp;
        uint32 decryptedAmount;
        bool isDecrypted;
    }

    mapping(string => Gift) public gifts;
    string[] public giftIds;

    event GiftAdded(string indexed giftId, address indexed sender);
    event GiftDecrypted(string indexed giftId, uint32 amount);

    constructor() ZamaEthereumConfig() {}

    function addGift(
        string calldata giftId,
        externalEuint32 encryptedAmount,
        bytes calldata amountProof,
        string calldata encryptedMessage
    ) external {
        require(bytes(gifts[giftId].encryptedMessage).length == 0, "Gift already exists");

        require(FHE.isInitialized(FHE.fromExternal(encryptedAmount, amountProof)), "Invalid encrypted amount");

        gifts[giftId] = Gift({
            encryptedMessage: encryptedMessage,
            encryptedAmount: FHE.fromExternal(encryptedAmount, amountProof),
            sender: msg.sender,
            timestamp: block.timestamp,
            decryptedAmount: 0,
            isDecrypted: false
        });

        FHE.allowThis(gifts[giftId].encryptedAmount);
        FHE.makePubliclyDecryptable(gifts[giftId].encryptedAmount);

        giftIds.push(giftId);

        emit GiftAdded(giftId, msg.sender);
    }

    function decryptGift(
        string calldata giftId,
        bytes memory abiEncodedClearAmount,
        bytes memory decryptionProof
    ) external {
        require(bytes(gifts[giftId].encryptedMessage).length > 0, "Gift does not exist");
        require(!gifts[giftId].isDecrypted, "Gift already decrypted");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(gifts[giftId].encryptedAmount);

        FHE.checkSignatures(cts, abiEncodedClearAmount, decryptionProof);

        uint32 decodedAmount = abi.decode(abiEncodedClearAmount, (uint32));

        gifts[giftId].decryptedAmount = decodedAmount;
        gifts[giftId].isDecrypted = true;

        emit GiftDecrypted(giftId, decodedAmount);
    }

    function getGift(string calldata giftId) external view returns (
        string memory encryptedMessage,
        address sender,
        uint256 timestamp,
        bool isDecrypted,
        uint32 decryptedAmount
    ) {
        require(bytes(gifts[giftId].encryptedMessage).length > 0, "Gift does not exist");
        Gift storage gift = gifts[giftId];

        return (
            gift.encryptedMessage,
            gift.sender,
            gift.timestamp,
            gift.isDecrypted,
            gift.decryptedAmount
        );
    }

    function getAllGiftIds() external view returns (string[] memory) {
        return giftIds;
    }

    function getEncryptedAmount(string calldata giftId) external view returns (euint32) {
        require(bytes(gifts[giftId].encryptedMessage).length > 0, "Gift does not exist");
        return gifts[giftId].encryptedAmount;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}


