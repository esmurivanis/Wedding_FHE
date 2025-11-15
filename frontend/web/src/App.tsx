// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface WeddingGift {
  id: string;
  sender: string;
  encryptedAmount: string;
  publicMessage: string;
  timestamp: number;
  isVerified: boolean;
  decryptedAmount?: number;
  creator: string;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [gifts, setGifts] = useState<WeddingGift[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingGift, setCreatingGift] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newGiftData, setNewGiftData] = useState({ amount: "", message: "" });
  const [selectedGift, setSelectedGift] = useState<WeddingGift | null>(null);
  const [decryptedAmount, setDecryptedAmount] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [userHistory, setUserHistory] = useState<string[]>([]);
  const [filteredGifts, setFilteredGifts] = useState<WeddingGift[]>([]);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadGifts();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  useEffect(() => {
    const filtered = gifts.filter(gift => 
      gift.sender.toLowerCase().includes(searchTerm.toLowerCase()) || 
      gift.publicMessage.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredGifts(filtered);
  }, [searchTerm, gifts]);

  const loadGifts = async () => {
    if (!isConnected) return;
    
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const giftsList: WeddingGift[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          giftsList.push({
            id: businessId,
            sender: businessData.creator,
            encryptedAmount: businessId,
            publicMessage: businessData.description,
            timestamp: Number(businessData.timestamp),
            isVerified: businessData.isVerified,
            decryptedAmount: Number(businessData.decryptedValue) || 0,
            creator: businessData.creator
          });
        } catch (e) {
          console.error('Error loading gift data:', e);
        }
      }
      
      setGifts(giftsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load gifts" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const createGift = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingGift(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating encrypted gift..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract");
      
      const amountValue = parseInt(newGiftData.amount) || 0;
      const businessId = `gift-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, amountValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        "Wedding Gift",
        encryptedResult.encryptedData,
        encryptedResult.proof,
        0,
        0,
        newGiftData.message
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Processing..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Gift sent successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadGifts();
      setShowCreateModal(false);
      setNewGiftData({ amount: "", message: "" });
      setUserHistory(prev => [...prev, `Sent gift to couple (${amountValue})`]);
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected") 
        ? "Transaction rejected" 
        : "Failed to send gift";
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingGift(false); 
    }
  };

  const decryptAmount = async (giftId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const giftData = await contractRead.getBusinessData(giftId);
      if (giftData.isVerified) {
        const storedValue = Number(giftData.decryptedValue) || 0;
        setDecryptedAmount(storedValue);
        setTransactionStatus({ visible: true, status: "success", message: "Already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(giftId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(giftId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      const amount = Number(clearValue);
      
      await loadGifts();
      setDecryptedAmount(amount);
      setTransactionStatus({ visible: true, status: "success", message: "Decrypted successfully!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      setUserHistory(prev => [...prev, `Decrypted gift from ${giftData.creator.substring(0,6)}`]);
      return amount;
      
    } catch (e: any) { 
      if (e.message?.includes("already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadGifts();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const handleDecryptClick = async (gift: WeddingGift) => {
    if (gift.isVerified || decryptedAmount !== null) {
      setDecryptedAmount(null);
      return;
    }
    
    const amount = await decryptAmount(gift.id);
    if (amount !== null) {
      setDecryptedAmount(amount);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const available = await contract.isAvailable();
      if (available) {
        setTransactionStatus({ visible: true, status: "success", message: "System available!" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>Dream Wedding Registry</h1>
          </div>
          <div className="header-actions">
            <div className="wallet-connect-wrapper">
              <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
            </div>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">💍</div>
            <h2>Connect Your Wallet</h2>
            <p>Please connect your wallet to access the private wedding registry and send encrypted gifts.</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect wallet using the button above</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>FHE system will initialize automatically</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Send encrypted gifts to the happy couple</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption...</p>
        <p>Status: {fhevmInitializing ? "Initializing" : status}</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading wedding registry...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>Dream Wedding Registry</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            + Send Gift
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="intro-section">
          <h2>Private Wedding Gift Registry</h2>
          <p>Send encrypted gifts to the happy couple. Gift amounts are kept private using FHE technology.</p>
          <div className="fhe-flow">
            <div className="flow-step">
              <div className="step-icon">1</div>
              <div className="step-content">
                <h4>Encrypt Gift</h4>
                <p>Your gift amount is encrypted with FHE 🔐</p>
              </div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step">
              <div className="step-icon">2</div>
              <div className="step-content">
                <h4>Store Securely</h4>
                <p>Encrypted data stored on-chain</p>
              </div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step">
              <div className="step-icon">3</div>
              <div className="step-content">
                <h4>Private Decryption</h4>
                <p>Couple decrypts gifts privately</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="gifts-section">
          <div className="section-header">
            <h2>Received Gifts</h2>
            <div className="search-container">
              <input 
                type="text" 
                placeholder="Search gifts..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="header-actions">
              <button 
                onClick={loadGifts} 
                className="refresh-btn"
              >
                Refresh
              </button>
              <button 
                onClick={checkAvailability}
                className="check-btn"
              >
                Check System
              </button>
            </div>
          </div>
          
          <div className="gifts-list">
            {filteredGifts.length === 0 ? (
              <div className="no-gifts">
                <p>No gifts received yet</p>
                <button 
                  className="create-btn" 
                  onClick={() => setShowCreateModal(true)}
                >
                  Send First Gift
                </button>
              </div>
            ) : filteredGifts.map((gift, index) => (
              <div 
                className={`gift-card ${selectedGift?.id === gift.id ? "selected" : ""} ${gift.isVerified ? "verified" : ""}`} 
                key={index}
                onClick={() => setSelectedGift(gift)}
              >
                <div className="gift-header">
                  <div className="gift-sender">{gift.sender.substring(0, 6)}...{gift.sender.substring(38)}</div>
                  <div className="gift-status">
                    {gift.isVerified ? "✅ Verified" : "🔓 Encrypted"}
                  </div>
                </div>
                <div className="gift-message">{gift.publicMessage}</div>
                <div className="gift-date">{new Date(gift.timestamp * 1000).toLocaleDateString()}</div>
                <div className="gift-actions">
                  <button 
                    className={`decrypt-btn ${(gift.isVerified || decryptedAmount !== null) ? 'decrypted' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDecryptClick(gift);
                    }}
                    disabled={isDecrypting}
                  >
                    {isDecrypting ? "Decrypting..." : gift.isVerified ? "Verified" : "Decrypt"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="history-section">
          <h3>Your Recent Actions</h3>
          <div className="history-list">
            {userHistory.length === 0 ? (
              <p>No recent actions</p>
            ) : (
              userHistory.map((action, index) => (
                <div key={index} className="history-item">
                  <div className="history-icon">✓</div>
                  <div className="history-text">{action}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateGift 
          onSubmit={createGift} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingGift} 
          giftData={newGiftData} 
          setGiftData={setNewGiftData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedGift && (
        <GiftDetailModal 
          gift={selectedGift} 
          onClose={() => { 
            setSelectedGift(null); 
            setDecryptedAmount(null); 
          }} 
          decryptedAmount={decryptedAmount} 
          isDecrypting={isDecrypting} 
          decryptAmount={() => decryptAmount(selectedGift.id)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <p>Private Wedding Registry - Built with FHE Technology</p>
        <p>All gift amounts are encrypted for privacy protection</p>
      </footer>
    </div>
  );
};

const ModalCreateGift: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  giftData: any;
  setGiftData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, giftData, setGiftData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'amount') {
      const intValue = value.replace(/[^\d]/g, '');
      setGiftData({ ...giftData, [name]: intValue });
    } else {
      setGiftData({ ...giftData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-gift-modal">
        <div className="modal-header">
          <h2>Send Wedding Gift</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 Encryption</strong>
            <p>Your gift amount will be encrypted with Zama FHE technology</p>
          </div>
          
          <div className="form-group">
            <label>Gift Amount *</label>
            <input 
              type="number" 
              name="amount" 
              value={giftData.amount} 
              onChange={handleChange} 
              placeholder="Enter gift amount..." 
              min="0"
            />
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
          
          <div className="form-group">
            <label>Your Message *</label>
            <textarea 
              name="message" 
              value={giftData.message} 
              onChange={handleChange} 
              placeholder="Your blessing message..." 
              rows={3}
            />
            <div className="data-type-label">Public Message</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !giftData.amount || !giftData.message} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting..." : "Send Gift"}
          </button>
        </div>
      </div>
    </div>
  );
};

const GiftDetailModal: React.FC<{
  gift: WeddingGift;
  onClose: () => void;
  decryptedAmount: number | null;
  isDecrypting: boolean;
  decryptAmount: () => Promise<number | null>;
}> = ({ gift, onClose, decryptedAmount, isDecrypting, decryptAmount }) => {
  const handleDecrypt = async () => {
    if (decryptedAmount !== null) return;
    await decryptAmount();
  };

  return (
    <div className="modal-overlay">
      <div className="gift-detail-modal">
        <div className="modal-header">
          <h2>Gift Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="gift-info">
            <div className="info-item">
              <span>Sender:</span>
              <strong>{gift.sender.substring(0, 6)}...{gift.sender.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Date Sent:</span>
              <strong>{new Date(gift.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item">
              <span>Message:</span>
              <strong>{gift.publicMessage}</strong>
            </div>
          </div>
          
          <div className="data-section">
            <h3>Encrypted Gift Amount</h3>
            
            <div className="data-row">
              <div className="data-label">Amount:</div>
              <div className="data-value">
                {gift.isVerified ? 
                  `${gift.decryptedAmount} (Verified)` : 
                  decryptedAmount !== null ? 
                  `${decryptedAmount} (Decrypted)` : 
                  "🔒 FHE Encrypted"
                }
              </div>
              <button 
                className={`decrypt-btn ${(gift.isVerified || decryptedAmount !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting || gift.isVerified}
              >
                {isDecrypting ? "Decrypting..." : gift.isVerified ? "Verified" : "Decrypt"}
              </button>
            </div>
            
            <div className="fhe-info">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE 🔐 Privacy Protection</strong>
                <p>Only the couple can decrypt gift amounts using their private key.</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;


