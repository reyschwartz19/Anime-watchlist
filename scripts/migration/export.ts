import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { makeExport, validateSourceUid, type UserExport } from './core';
import { outsideGitPath, writePrivateJson } from './files';

// Narrow interface makes the exact single-document read testable. This exporter
// has no collection/list/query/write surface and performs exactly one get().
export interface SingleDocumentReader {
  doc(path: string): {
    get(): Promise<{ exists: boolean; data(): unknown; readTime?: unknown; updateTime?: unknown }>;
  };
}

export async function exportOneUser(reader: SingleDocumentReader, sourceUid: string, projectId: string): Promise<UserExport> {
  validateSourceUid(sourceUid);
  if (!projectId) throw new Error('--firebase-project-id is required.');
  const path = `users/${sourceUid}`;
  const snapshot = await reader.doc(path).get();
  if (!snapshot.exists) throw new Error('The explicitly selected Firebase user document does not exist.');
  return makeExport({ projectId, uid: sourceUid, path }, snapshot.data(), { read: snapshot.readTime, update: snapshot.updateTime });
}

export async function exportFirebaseUser(options: { sourceUid: string; projectId: string; output: string }): Promise<UserExport> {
  validateSourceUid(options.sourceUid);
  outsideGitPath(options.output);
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) outsideGitPath(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const app = initializeApp({ credential: applicationDefault(), projectId: options.projectId }, `one-user-export-${Date.now()}`);
  try {
    const firestore = getFirestore(app);
    firestore.settings({ useBigInt: true });
    const result = await exportOneUser(firestore, options.sourceUid, options.projectId);
    writePrivateJson(options.output, result);
    return result;
  } finally {
    await deleteApp(app);
  }
}
