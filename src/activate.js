// One-time setup: subscribes the wallet to the TxLINE free World Cup tier
// on-chain, then activates an API token for data access.
//
// Usage: npm run activate
import fs from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import axios from "axios";
import nacl from "tweetnacl";
import { CONFIG } from "./config.js";
import { saveCredentials } from "./tokenStore.js";
import txoracleIdl from "../idl/txoracle.json" with { type: "json" };

async function main() {
  if (!fs.existsSync(CONFIG.walletKeypairPath)) {
    throw new Error(
      `Wallet keypair not found at ${CONFIG.walletKeypairPath}. Generate one with:\n` +
        `  solana-keygen new -o ${CONFIG.walletKeypairPath}\n` +
        `Then fund it with a little SOL on ${CONFIG.network} for tx fees.`
    );
  }

  const secretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(CONFIG.walletKeypairPath, "utf-8"))
  );
  const keypair = Keypair.fromSecretKey(secretKey);
  const wallet = new anchor.Wallet(keypair);

  const connection = new Connection(CONFIG.rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = new anchor.Program(txoracleIdl, provider);

  if (!program.programId.equals(CONFIG.programId)) {
    throw new Error(
      `Loaded IDL program ${program.programId.toBase58()} does not match ` +
        `${CONFIG.network} program ${CONFIG.programId.toBase58()}`
    );
  }

  console.log(`[activate] network=${CONFIG.network} wallet=${keypair.publicKey.toBase58()}`);

  const SERVICE_LEVEL_ID = CONFIG.serviceLevelId; // 1 = free 60s delay, 12 = mainnet real-time
  const DURATION_WEEKS = 4;
  const SELECTED_LEAGUES = []; // empty = standard free bundle (World Cup + Int'l Friendlies)

  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    program.programId
  );
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    CONFIG.txlTokenMint,
    tokenTreasuryPda,
    true,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    program.programId
  );
  const userTokenAccount = getAssociatedTokenAddressSync(
    CONFIG.txlTokenMint,
    provider.wallet.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  console.log(`[activate] ensuring user_token_account exists (ATA for TxL mint)...`);
  const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    provider.wallet.publicKey,
    userTokenAccount,
    provider.wallet.publicKey,
    CONFIG.txlTokenMint,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const ataTx = new anchor.web3.Transaction().add(createAtaIx);
  const ataTxSig = await provider.sendAndConfirm(ataTx);
  console.log(`[activate] ATA ready (tx: ${ataTxSig})`);

  console.log(`[activate] subscribing: serviceLevel=${SERVICE_LEVEL_ID} weeks=${DURATION_WEEKS}`);

  const txSig = await program.methods
    .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
    .accounts({
      user: provider.wallet.publicKey,
      pricingMatrix: pricingMatrixPda,
      tokenMint: CONFIG.txlTokenMint,
      userTokenAccount,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(`[activate] on-chain subscription tx: ${txSig}`);

  const authResponse = await axios.post(`${CONFIG.apiOrigin}/auth/guest/start`);
  const jwt = authResponse.data.token;

  const messageString = `${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`;
  const message = new TextEncoder().encode(messageString);
  const signatureBytes = nacl.sign.detached(message, keypair.secretKey);
  const walletSignature = Buffer.from(signatureBytes).toString("base64");

  const activationResponse = await axios.post(
    `${CONFIG.apiBaseUrl}/token/activate`,
    { txSig, walletSignature, leagues: SELECTED_LEAGUES },
    { headers: { Authorization: `Bearer ${jwt}` } }
  );

  const apiToken = activationResponse.data.token || activationResponse.data;

  saveCredentials({ jwt, apiToken, network: CONFIG.network });

  console.log("[activate] done. Credentials saved to data/credentials.json");
  console.log("[activate] run `npm start` to launch the detector.");
}

main().catch((err) => {
  console.error("[activate] failed:", err?.response?.data || err.message || err);
  process.exit(1);
});