import FilesPanel from "@/components/filora/FilesPanel";
import { usePcSessionContext } from "@/features/filora/hooks/usePcSession";

// Step 3: the shared files, ready to download.
export default function PcFilesPage() {
  const {
    connectionMode,
    connection,
    authToken,
    shareUrl,
    files,
    message,
    loading,
    savingFileId,
    resetSession,
    loadFiles,
    handleDownload,
  } = usePcSessionContext();

  return (
    <FilesPanel
      connectionMode={connectionMode}
      shareUrl={shareUrl}
      files={files}
      message={message}
      loading={loading}
      savingFileId={savingFileId}
      onRefresh={() => connection && loadFiles(connection, authToken)}
      onDownload={handleDownload}
      onDisconnect={resetSession}
    />
  );
}
