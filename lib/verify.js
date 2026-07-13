// Offline Covenant Receipt verifier (Receipt v1). Pure — no network, no config.
// Mirrors the server's receipt contract exactly:
//   1. boundToDecree = approval.contentHash === receipt.contentHash
//                      && approval.decreeId === receipt.decreeId
//   2. sigValid      = Ed25519.verify(hex signature,
//                        sha256(utf8(JSON.stringify([approval.tenantId, approval.decreeId,
//                          approval.approverId, approval.scope, approval.contentHash,
//                          approval.nonce, approval.expiry]))), hex pubKey)
//   3. chainValid    = chain.entryHash === sha256hex(JSON.stringify({ tenantId: receipt.tenantId,
//                        eventType: chain.eventType, payload: chain.payload, prev: chain.prevHash }))
// valid = all three. Expiry is REPORTED, not enforced.
import { createHash } from 'node:crypto';
import * as ed from '@noble/ed25519';

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest();
const sha256hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const hexToBytes = (h) => {
  if (typeof h !== 'string' || h.length % 2 !== 0 || /[^0-9a-fA-F]/.test(h)) throw new Error('bad hex');
  return Uint8Array.from(Buffer.from(h, 'hex'));
};

/**
 * Verify a Receipt v1 offline.
 * @param {object} receipt parsed receipt JSON
 * @param {{pubkeyOverride?: string}} [opts] hex Ed25519 public key that WINS over receipt.pubKey
 * @returns {Promise<{valid:boolean, sigValid?:boolean, boundToDecree?:boolean, chainValid?:boolean,
 *                    decision?:string, decreeId?:string, expiry?:*, error?:string}>}
 */
export async function verifyReceipt(receipt, { pubkeyOverride } = {}) {
  try {
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw new Error('receipt must be an object');
    const { approval, chain } = receipt;
    if (!approval || typeof approval !== 'object') throw new Error('receipt.approval missing');
    if (!chain || typeof chain !== 'object') throw new Error('receipt.chain missing');

    // 1) approval is bound to THIS decree + content
    const boundToDecree =
      approval.contentHash === receipt.contentHash && approval.decreeId === receipt.decreeId;

    // 2) Ed25519 signature over sha256 of the canonical approval tuple
    let sigValid = false;
    try {
      const msg = sha256(JSON.stringify([
        approval.tenantId, approval.decreeId, approval.approverId, approval.scope,
        approval.contentHash, approval.nonce, approval.expiry,
      ]));
      const pub = pubkeyOverride ?? receipt.pubKey;
      sigValid = await ed.verifyAsync(hexToBytes(approval.signature), msg, hexToBytes(pub));
    } catch { sigValid = false; }

    // 3) hash-chain entry consistency
    const chainValid = chain.entryHash === sha256hex(JSON.stringify({
      tenantId: receipt.tenantId,
      eventType: chain.eventType,
      payload: chain.payload,
      prev: chain.prevHash,
    }));

    return {
      valid: sigValid && boundToDecree && chainValid,
      sigValid, boundToDecree, chainValid,
      decision: receipt.decision,
      decreeId: receipt.decreeId,
      expiry: approval.expiry,
    };
  } catch (e) {
    return { valid: false, error: e?.message || String(e) };
  }
}
