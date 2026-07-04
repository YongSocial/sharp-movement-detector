import "dotenv/config";
import { PublicKey } from "@solana/web3.js";

const NETWORK = process.env.NETWORK === "mainnet" ? "mainnet" : "devnet";

export const NETWORK_CONFIG = {
  mainnet: {
    rpcUrl: "https://api.mainnet-beta.solana.com",
    apiOrigin: "https://txline.txodds.com",
    programId: new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA"),
    txlTokenMint: new PublicKey("Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL"),
  },
  devnet: {
    rpcUrl: "https://api.devnet.solana.com",
    apiOrigin: "https://txline-dev.txodds.com",
    programId: new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"),
    txlTokenMint: new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG"),
  },
}[NETWORK];

export const CONFIG = {
  network: NETWORK,
  ...NETWORK_CONFIG,
  apiBaseUrl: `${NETWORK_CONFIG.apiOrigin}/api`,
  walletKeypairPath: process.env.WALLET_KEYPAIR_PATH || "./wallet-keypair.json",
  serviceLevelId: Number(process.env.SERVICE_LEVEL_ID || 1),
  moveThreshold: Number(process.env.MOVE_THRESHOLD || 0.15),
  moveThresholdPct: Number(process.env.MOVE_THRESHOLD_PCT || 0.05),
  lookbackMs: Number(process.env.LOOKBACK_MS || 3600000),
  port: Number(process.env.PORT || 4000),
};
