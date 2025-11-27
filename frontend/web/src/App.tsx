import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useState, useEffect } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface GiftData {
  id: string;
  sender: string;
  encryptedAmount: string;
  publicMessage: string;
  timestamp: number;
  isVerified: boolean;
  decryptedAmount?: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [gifts, setGifts] = useState<GiftData[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingGift, setCreatingGift] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newGiftData, setNewGiftData] = useState({ amount: "", message: "" });
  const [selectedGift, setSelectedGift] = useState<GiftData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [stats, setStats] = useState({ total: 0, verified: 0, average: 0 });

  const { initialize, isInitialized } = useFhevm();
  const { encrypt } = useEncrypt();
  const { verifyDecryption } = useDecrypt();

  useEffect(() => {
    const initFhevm = async () => {
      if (!isConnected || isInitialized) return;
      try {
        await initialize();
      } catch (error) {
        console.error('FHEVM initialization failed:', error);
      }
    };
    initFhevm();
  }, [isConnected, initialize, isInitialized]);

  useEffect(() => {
    const loadData = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      try {
        const contract = await getContractReadOnly();
        if (!contract) return;
        
        const businessIds = await contract.getAllBusinessIds();
        const giftsList: GiftData[] = [];
        
        for (const id of businessIds) {
          const data = await contract.getBusinessData(id);
          giftsList.push({
            id,
            sender: data.creator,
            encryptedAmount: id,
            publicMessage: data.description,
            timestamp: Number(data.timestamp),
            isVerified: data.isVerified,
            decryptedAmount: Number(data.decryptedValue) || 0
          });
        }
        
        setGifts(giftsList);
        updateStats(giftsList);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [isConnected]);

  const updateStats = (gifts: GiftData[]) => {
    const total = gifts.length;
    const verified = gifts.filter(g => g.isVerified).length;
    const average = total > 0 ? gifts.reduce((sum, g) => sum + (g.decryptedAmount || 0), 0) / total : 0;
    setStats({ total, verified, average });
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
      
      const amount = parseInt(newGiftData.amount) || 0;
      const businessId = `gift-${Date.now()}`;
      
      const encryptedResult = await encrypt(await contract.getAddress(), address, amount);
      
      const tx = await contract.createBusinessData(
        businessId,
        "Wedding Gift",
        encryptedResult.encryptedData,
        encryptedResult.proof,
        0,
        0,
        newGiftData.message
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for confirmation..." });
      await tx.wait();
      
      setHistory(prev => [...prev, `Created gift ${businessId}`]);
      setTransactionStatus({ visible: true, status: "success", message: "Gift created successfully!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
      setShowCreateModal(false);
      setNewGiftData({ amount: "", message: "" });
    } catch (error: any) {
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: error.message?.includes("user rejected") ? "Transaction rejected" : "Creation failed" 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally {
      setCreatingGift(false);
    }
  };

  const decryptGift = async (gift: GiftData) => {
    if (!isConnected || !address) {
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return;
    }
    
    try {
      const contractRead = await getContractReadOnly();
      const contractWrite = await getContractWithSigner();
      if (!contractRead || !contractWrite) return;
      
      if (gift.isVerified) {
        setTransactionStatus({ visible: true, status: "success", message: "Already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return;
      }
      
      const encryptedValue = await contractRead.getEncryptedValue(gift.id);
      
      const result = await verifyDecryption(
        [encryptedValue],
        await contractRead.getAddress(),
        (abiEncodedClearValues, decryptionProof) => 
          contractWrite.verifyDecryption(gift.id, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValue];
      setHistory(prev => [...prev, `Decrypted gift ${gift.id}`]);
      
      setTransactionStatus({ visible: true, status: "success", message: "Decryption verified!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (error) {
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const available = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: "Contract is available!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (error) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredGifts = gifts.filter(gift => 
    gift.publicMessage.toLowerCase().includes(searchTerm.toLowerCase()) ||
    gift.sender.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>Private Wedding Registry 🔐</h1>
          </div>
          <div className="wallet-connect-wrapper">
            <ConnectButton />
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">💍</div>
            <h2>Connect Your Wallet</h2>
            <p>Please connect your wallet to access the encrypted wedding gift registry.</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect your wallet</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>Initialize FHE system</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Send encrypted gifts</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="loading-spinner"></div>
      <p>Loading wedding registry...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>Private Wedding Registry 🔐</h1>
          <p>Send encrypted gifts with FHE protection</p>
        </div>
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            + New Gift
          </button>
          <ConnectButton />
        </div>
      </header>
      
      <div className="main-content">
        <div className="stats-section">
          <div className="stat-card">
            <h3>Total Gifts</h3>
            <div className="stat-value">{stats.total}</div>
          </div>
          <div className="stat-card">
            <h3>Verified</h3>
            <div className="stat-value">{stats.verified}</div>
          </div>
          <div className="stat-card">
            <h3>Average</h3>
            <div className="stat-value">{stats.average.toFixed(1)}</div>
          </div>
        </div>
        
        <div className="search-section">
          <input
            type="text"
            placeholder="Search gifts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <button onClick={checkAvailability} className="check-btn">
            Check Availability
          </button>
        </div>
        
        <div className="gifts-section">
          <h2>Wedding Gifts</h2>
          <div className="gifts-list">
            {filteredGifts.length === 0 ? (
              <div className="no-gifts">
                <p>No gifts found</p>
                <button 
                  onClick={() => setShowCreateModal(true)}
                  className="create-btn"
                >
                  Create First Gift
                </button>
              </div>
            ) : (
              filteredGifts.map((gift, index) => (
                <div 
                  key={index}
                  className={`gift-card ${selectedGift?.id === gift.id ? "selected" : ""}`}
                  onClick={() => setSelectedGift(gift)}
                >
                  <div className="gift-header">
                    <div className="gift-sender">{gift.sender.substring(0, 6)}...{gift.sender.substring(38)}</div>
                    <div className={`gift-status ${gift.isVerified ? "verified" : "encrypted"}`}>
                      {gift.isVerified ? "Verified" : "Encrypted"}
                    </div>
                  </div>
                  <div className="gift-message">{gift.publicMessage}</div>
                  <div className="gift-footer">
                    <div className="gift-date">{new Date(gift.timestamp * 1000).toLocaleDateString()}</div>
                    {gift.isVerified && (
                      <div className="gift-amount">Amount: {gift.decryptedAmount}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        
        <div className="history-section">
          <h3>Your Activity</h3>
          <div className="history-list">
            {history.length === 0 ? (
              <p>No recent activity</p>
            ) : (
              history.map((item, index) => (
                <div key={index} className="history-item">
                  {item}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal">
            <div className="modal-header">
              <h2>New Wedding Gift</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Gift Amount (FHE Encrypted)</label>
                <input
                  type="number"
                  value={newGiftData.amount}
                  onChange={(e) => setNewGiftData({...newGiftData, amount: e.target.value})}
                  placeholder="Enter amount..."
                  min="0"
                />
              </div>
              <div className="form-group">
                <label>Blessing Message (Public)</label>
                <textarea
                  value={newGiftData.message}
                  onChange={(e) => setNewGiftData({...newGiftData, message: e.target.value})}
                  placeholder="Enter your blessing..."
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="cancel-btn">
                Cancel
              </button>
              <button 
                onClick={createGift} 
                disabled={creatingGift || !newGiftData.amount || !newGiftData.message}
                className="submit-btn"
              >
                {creatingGift ? "Creating..." : "Create Gift"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {selectedGift && (
        <div className="modal-overlay">
          <div className="detail-modal">
            <div className="modal-header">
              <h2>Gift Details</h2>
              <button onClick={() => setSelectedGift(null)} className="close-btn">
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="detail-row">
                <span>Sender:</span>
                <span>{selectedGift.sender}</span>
              </div>
              <div className="detail-row">
                <span>Date:</span>
                <span>{new Date(selectedGift.timestamp * 1000).toLocaleString()}</span>
              </div>
              <div className="detail-row">
                <span>Message:</span>
                <span>{selectedGift.publicMessage}</span>
              </div>
              <div className="detail-row">
                <span>Amount:</span>
                <span>
                  {selectedGift.isVerified 
                    ? selectedGift.decryptedAmount 
                    : "🔒 Encrypted"}
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setSelectedGift(null)} className="close-btn">
                Close
              </button>
              {!selectedGift.isVerified && (
                <button 
                  onClick={() => decryptGift(selectedGift)}
                  className="decrypt-btn"
                >
                  Verify Decryption
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      
      {transactionStatus.visible && (
        <div className="notification">
          <div className={`notification-content ${transactionStatus.status}`}>
            {transactionStatus.message}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;