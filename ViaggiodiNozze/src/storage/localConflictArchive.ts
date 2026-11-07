/**
 * HOUNIGO — ARCHIVIO CONFLITTI LOCALE ISOLATO (P0 PRIVACY & RESILIENZA)
 * 
 * Re-export modulare dall'infrastruttura di storage locale isolata.
 */

export {
  type ConflictBackupRecord,
  saveConflictBackup,
  getConflictBackups,
  getConflictBackupById,
  removeConflictBackup,
  clearConflictBackups
} from './localMutationQueue';
