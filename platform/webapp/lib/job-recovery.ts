/**
 * Stuck-job recovery utility.
 *
 * Resets jobs that have been in "Running" or "Queued" status for longer than
 * maxAgeMs to "Failed". Call once at application boot to handle crash-recovery
 * scenarios where a process restart left jobs in a terminal-less state.
 */

import { listJobs, updateJob } from './data-store.ts';

/**
 * Setzt Jobs die länger als maxAgeMs in "Running" oder "Queued" Status sind auf "Failed".
 * Muss beim App-Start aufgerufen werden um Crash-Recovery zu ermöglichen.
 *
 * @param maxAgeMs - Maximum age in milliseconds before a stuck job is recovered (default: 5 minutes)
 * @returns Number of jobs that were recovered
 */
export async function recoverStuckJobs(maxAgeMs = 5 * 60_000): Promise<number> {
  const jobs = await listJobs();
  const now = Date.now();
  let recovered = 0;

  for (const job of jobs) {
    const isStuck = job.status === 'Running' || job.status === 'Queued';
    const startedAt = job.startedAt ? Date.parse(job.startedAt) : NaN;
    const isOld = isNaN(startedAt) || now - startedAt > maxAgeMs;

    if (isStuck && isOld) {
      await updateJob(job.id, {
        status: 'Failed',
        updatedAt: new Date().toISOString(),
        details: { error: 'Job interrupted: process restarted or timed out' }
      });
      recovered++;
    }
  }

  return recovered;
}
