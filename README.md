# Private Wedding Registry

Private Wedding Registry is a privacy-preserving application designed to revolutionize the way couples manage and receive gifts during their wedding celebrations. Powered by Zama's Fully Homomorphic Encryption (FHE) technology, this application enables guests to send encrypted monetary gifts, ensuring the amounts remain confidential while allowing newlyweds to decrypt messages of goodwill without ever exposing sensitive information.

## The Problem

Weddings are significant social events where financial gifts play a fundamental role. However, traditional gifting methods expose sensitive information, making it susceptible to prying eyes. The lack of privacy can lead to uncomfortable situations, affect social dynamics, and undermine the joy of the occasion. With cleartext data, sensitive gift amounts and messages can be accessed by unauthorized parties, threatening both the guest's and couple's privacy.

## The Zama FHE Solution

This is where Zama's Fully Homomorphic Encryption (FHE) shines. FHE allows for computation on encrypted data, meaning that sensitive information can be processed and analyzed without ever revealing the underlying data. By using Zama’s state-of-the-art libraries, such as fhevm, we can securely handle wedding gift transactions and messages. Guests can send monetary contributions and heartfelt messages encrypted to eliminate privacy concerns, offering peace of mind for everyone involved.

## Key Features

- 💌 **Encrypted Gifts**: Guests can send digital red envelopes containing encrypted monetary gifts to preserve sender anonymity.
- 🎉 **Private Messages**: New couples receive encrypted well-wishes and messages that remain confidential and secure.
- 👰 **Social Etiquette**: Allows couples to respect social norms while maintaining privacy.
- 🔒 **Privacy Protection**: Ensures that all transactions remain confidential, keeping sensitive information safe from prying eyes.

## Technical Architecture & Stack

The Private Wedding Registry employs a robust technical architecture centered on Zama's privacy technology. The components of the stack include:

- **Zama FHE Libraries**: Utilizing fhevm for secure computation and encryption.
- **Frontend**: Developed with React for a seamless user interface.
- **Smart Contracts**: Written in Solidity for secure and trusted transactions.
- **Database**: NoSQL database for managing user data securely.

## Smart Contract / Core Logic

The heart of our application lies in the smart contract that handles encrypted transactions. Below is a pseudo-code snippet illustrating how we utilize Zama's technology to process encrypted gifts securely.

```solidity
// Solidity Contract for Private Wedding Registry

pragma solidity ^0.8.0;

contract PrivateWeddingRegistry {
    mapping(address => uint256) public gifts;
    
    // Function to send encrypted gift
    function sendGift(uint64 encryptedAmount) public {
        // Process the encrypted amount
        uint64 decryptedAmount = TFHE.decrypt(encryptedAmount);
        gifts[msg.sender] += decryptedAmount; // Store the decrypted value securely
    }
}
```

In this example, we use a smart contract to receive encrypted gifts, which are decrypted securely while ensuring the original values remain confidential.

## Directory Structure

Here's how the project directory is structured:

```
/PrivateWeddingRegistry
    ├── contracts
    │   └── PrivateWeddingRegistry.sol
    ├── src
    │   ├── App.js
    │   ├── components
    │   │   └── GiftForm.js
    │   └── styles
    │       └── App.css
    ├── README.md
    └── package.json
```

This structure organizes the smart contract and front-end code, ensuring clarity and ease of development.

## Installation & Setup

To get started with the Private Wedding Registry, follow these instructions:

### Prerequisites

- Node.js (for frontend)
- npm (Node package manager)
- Solidity compiler
- Zama's FHE libraries

### Steps to Install

1. Install dependencies:
   ```bash
   npm install
   ```

2. Install Zama's FHE library:
   ```bash
   npm install fhevm
   ```

3. Ensure you have the necessary tools to compile and run your smart contracts.

## Build & Run

To compile and run the Private Wedding Registry application, use the following commands:

1. Compile the smart contract:
   ```bash
   npx hardhat compile
   ```

2. Start the React application:
   ```bash
   npm start
   ```

This will start your local development server, allowing you to interact with the Private Wedding Registry.

## Acknowledgements

We extend our heartfelt gratitude to Zama for providing the open-source FHE primitives that make this project possible. Their advanced cryptographic technology enables us to build applications that prioritize user privacy and security.

With the Private Wedding Registry, couples can focus on celebrating their special day while maintaining full control over their privacy. Embrace the future of gift-giving with a secure and confidential approach, ensuring that every moment is filled with joy without compromising peace of mind.


