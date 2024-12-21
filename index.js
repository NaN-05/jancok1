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

// Fungsi untuk mencetak log ke bawah
const logToConsole = (message) => {
  console.log(`\x1b[32m${message}\x1b[0m`); // Teks hijau
};

// Fungsi untuk memproses transfer di jaringan tertentu
const processNetworkTransfer = async (networkName) => {
  const networkConfig = getNetworkConfig(networkName);
  if (!networkConfig || !networkConfig.rpcUrl || !networkConfig.chainId) {
    logToConsole(`❌ Invalid network configuration for: ${networkName}`);
    return;
  }

  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
  const depositWallet = new ethers.Wallet(process.env.DEPOSIT_WALLET_PRIVATE_KEY, provider);
  const depositWalletAddress = await depositWallet.getAddress();

  try {
    const balance = await provider.getBalance(depositWalletAddress);
    const formattedBalance = ethers.formatEther(balance);

    logToConsole(`[${networkName}] 💰 Current balance: ${formattedBalance} ETH`);

    if (balance >= MIN_TRANSFER_AMOUNT) {
      logToConsole(`[${networkName}] ⚡ Balance meets the minimum transfer requirement.`);
      const feeData = await provider.getFeeData();
      const gasPrice = (feeData.gasPrice || feeData.maxFeePerGas) * BigInt(12) / BigInt(10); // Tambahkan buffer 20%

      const gasLimit = await provider.estimateGas({
        to: process.env.VAULT_WALLET_ADDRESS,
        value: balance - gasPrice * BigInt(21000),
      });

      const maxGasFee = gasPrice * gasLimit;

      if (balance > maxGasFee) {
        const txDetails = {
          to: process.env.VAULT_WALLET_ADDRESS,
          value: balance - maxGasFee,
          gasLimit,
          gasPrice,
        };

        const txResponse = await depositWallet.sendTransaction(txDetails);
        const receipt = await txResponse.wait();

        logToConsole(
          `[${networkName}] ✅ Transaction confirmed in block ${receipt.blockNumber}. Transferred to ${process.env.VAULT_WALLET_ADDRESS}`
        );
      } else {
        logToConsole(`[${networkName}] ⚠️ Insufficient balance to cover gas fees.`);
      }
    } else {
      logToConsole(`[${networkName}] ⚠️ Balance is below the minimum transfer amount.`);
    }
  } catch (err) {
    logToConsole(`[${networkName}] ❌ Error: ${err.message}`);
  }
};

// Fungsi utama untuk iterasi melalui semua jaringan
const main = async () => {
  const networks = ['ethereum', 'bsc', 'arbitrum', 'base'];
  console.clear(); // Membersihkan layar

  networks.forEach((network) => {
    logToConsole(`🌐 Monitoring Network: ${network.toUpperCase()}`);
  });

  for (const network of networks) {
    await processNetworkTransfer(network);
  }

  logToConsole(`\n🕒 Monitoring interval: ${MONITORING_INTERVAL / 1000} seconds.\n`);
};

// Jalankan fungsi monitoring dengan interval yang diatur
if (require.main === module) {
  setInterval(() => {
    main().catch((err) => {
      console.error(`❌ Error in main function: ${err.message}`);
    });
  }, MONITORING_INTERVAL);
}
