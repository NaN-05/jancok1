require('dotenv').config();
const { ethers } = require('ethers');

// Fungsi untuk memilih konfigurasi jaringan
const getNetworkConfig = (networkName) => {
  const networks = {
    ethereum: {
      rpcUrl: process.env.ETHEREUM_RPC_URL,
      chainId: parseInt(process.env.ETHEREUM_CHAIN_ID, 10),
    },
    bsc: {
      rpcUrl: process.env.BSC_RPC_URL,
      chainId: parseInt(process.env.BSC_CHAIN_ID, 10),
    },
    arbitrum: {
      rpcUrl: process.env.ARBITRUM_RPC_URL,
      chainId: parseInt(process.env.ARBITRUM_CHAIN_ID, 10),
    },
    base: {
      rpcUrl: process.env.BASE_RPC_URL,
      chainId: parseInt(process.env.BASE_CHAIN_ID, 10),
    },
  };

  return networks[networkName];
};

const MIN_TRANSFER_AMOUNT = ethers.parseEther(process.env.MIN_TRANSFER_AMOUNT || '0.001'); // Default 0.001 ETH
const MONITORING_INTERVAL = parseInt(process.env.MONITORING_INTERVAL, 10) || 60000; // Default 60 detik

// Fungsi untuk memproses transfer di jaringan tertentu
const processNetworkTransfer = async (networkName) => {
  const networkConfig = getNetworkConfig(networkName);
  if (!networkConfig || !networkConfig.rpcUrl || !networkConfig.chainId) {
    console.error(`❌ Invalid network configuration for: ${networkName}`);
    return;
  }

  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  const depositWallet = new ethers.Wallet(process.env.DEPOSIT_WALLET_PRIVATE_KEY, provider);
  const depositWalletAddress = await depositWallet.getAddress();

  try {
    const balance = await provider.getBalance(depositWalletAddress);
    console.log(`[${networkName}] 💰 Current balance: ${ethers.formatEther(balance)} ETH`);

    if (balance >= MIN_TRANSFER_AMOUNT) {
      console.log(`[${networkName}] ⚡ Balance meets the minimum transfer requirement.`);
      const feeData = await provider.getFeeData();
      const gasPrice = (feeData.gasPrice || feeData.maxFeePerGas) * BigInt(1.2); // Tambahkan buffer 20%

      const gasLimit = await provider.estimateGas({
        to: process.env.VAULT_WALLET_ADDRESS,
        value: balance - gasPrice * BigInt(21000), // Mengurangi gas fee
      });

      const maxGasFee = gasPrice * gasLimit;

      if (balance > maxGasFee) {
        const txDetails = {
          to: process.env.VAULT_WALLET_ADDRESS,
          value: balance - maxGasFee,
          gasLimit,
          gasPrice,
        };

        console.log(`[${networkName}] 🚀 Sending transaction...`);
        const txResponse = await depositWallet.sendTransaction(txDetails);
        console.log(`[${networkName}] 🔗 Transaction sent: ${txResponse.hash}`);

        const receipt = await txResponse.wait();
        console.log(`[${networkName}] ✅ Transaction confirmed in block ${receipt.blockNumber}`);
        console.log(`[${networkName}] 💸 Transferred to ${process.env.VAULT_WALLET_ADDRESS}`);
      } else {
        console.log(`[${networkName}] ⚠️ Insufficient balance to cover gas fees.`);
      }
    } else {
      console.log(`[${networkName}] ⚠️ Balance is below the minimum transfer amount (${ethers.formatEther(MIN_TRANSFER_AMOUNT)} ETH).`);
    }
  } catch (err) {
    console.error(`[${networkName}] ❌ Error checking balance or sending transaction:`, err);
  }
};

// Fungsi utama untuk iterasi melalui semua jaringan
const main = async () => {
  const networks = ['ethereum', 'bsc', 'arbitrum', 'base'];
  console.log('🔄 Starting auto-transfer process for all networks...');

  for (const networkName of networks) {
    console.log(`🌐 Monitoring network: ${networkName}`);
    await processNetworkTransfer(networkName);
  }

  console.log('✅ Auto-transfer process completed for all networks.');
};

// Jalankan fungsi monitoring dengan interval yang diatur
if (require.main === module) {
  console.log(`🕒 Monitoring interval set to ${MONITORING_INTERVAL / 1000} seconds.`);
  setInterval(() => {
    main().catch((err) => {
      console.error('❌ Error in main function:', err);
    });
  }, MONITORING_INTERVAL);
                        }
