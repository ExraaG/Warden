'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { WardenIcon } from '../../components/ui/WardenIcon';
import { showToast } from '../../components/ui/Toast';

interface CraftyFile {
  name: string;
  is_dir: boolean;
  size?: number;
  mod_time?: string;
}

export default function FilesPage() {
  const [serverId, setServerId] = useState<string>('');
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<CraftyFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [loadingContent, setLoadingContent] = useState<boolean>(false);
  const [savingFile, setSavingFile] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const activeId = localStorage.getItem('warden_selected_server_id') || '';
    setServerId(activeId);

    const handleServerChange = (e: any) => {
      if (e.detail) {
        setServerId(e.detail);
        setCurrentPath('');
        setSelectedFile(null);
        setFileContent('');
      }
    };

    window.addEventListener('warden_server_changed', handleServerChange);
    return () => window.removeEventListener('warden_server_changed', handleServerChange);
  }, []);

  useEffect(() => {
    if (serverId) {
      fetchFiles(currentPath);
    }
  }, [serverId, currentPath]);

  const fetchFiles = (relPath: string) => {
    setLoadingFiles(true);
    fetch(`/api/v1/servers/${serverId}/files?path=${encodeURIComponent(relPath)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setFiles(data.data);
        } else {
          setFiles([]);
        }
      })
      .catch(() => setFiles([]))
      .finally(() => setLoadingFiles(false));
  };

  const handleOpenFile = (filename: string) => {
    const fullPath = currentPath ? `${currentPath}/${filename}` : filename;
    setSelectedFile(fullPath);
    setLoadingContent(true);
    setStatusMessage(null);

    fetch(`/api/v1/servers/${serverId}/files/content?path=${encodeURIComponent(fullPath)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          const content = data.data.content || '';
          setFileContent(content);
          setOriginalContent(content);
        } else {
          setFileContent('# Failed to load file content.');
        }
      })
      .catch(() => setFileContent('# Error reading file.'))
      .finally(() => setLoadingContent(false));
  };

  const handleSaveFile = () => {
    if (!selectedFile) return;
    setSavingFile(true);
    setStatusMessage(null);

    fetch(`/api/v1/servers/${serverId}/files/content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: selectedFile, content: fileContent }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setOriginalContent(fileContent);
          showToast(`Successfully saved ${selectedFile}`, 'success');
        } else {
          showToast(`Failed to save file: ${data.error}`, 'error');
        }
      })
      .catch((err) => showToast(`Error: ${err.message}`, 'error'))
      .finally(() => setSavingFile(false));
  };

  const handleDeleteFile = (filename: string) => {
    const fullPath = currentPath ? `${currentPath}/${filename}` : filename;

    fetch(`/api/v1/servers/${serverId}/files`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fullPath }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          if (selectedFile === fullPath) {
            setSelectedFile(null);
            setFileContent('');
          }
          showToast(`Deleted ${filename}`, 'info');
          fetchFiles(currentPath);
        } else {
          showToast(`Failed to delete: ${data.error}`, 'error');
        }
      })
      .catch((err) => showToast(`Error: ${err.message}`, 'error'));
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const pathParts = currentPath.split('/').filter(Boolean);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Bar */}
      <Card className="bg-[var(--bg-surface)] border-[var(--color-border)] p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2.5 sm:gap-3 font-minecraft">
            <WardenIcon name="folder" size={20} className="text-[var(--color-accent)] shrink-0" />
            <span>Server File Manager</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Browse server files, edit configs, and manage server storage via Crafty Controller.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchFiles(currentPath)} isLoading={loadingFiles} className="shrink-0 self-start sm:self-auto">
          <WardenIcon name="refresh-cw" size={14} className="text-slate-300" />
          <span>Refresh</span>
        </Button>
      </Card>

      {statusMessage && (
        <div
          className={`p-3 sm:p-4 rounded-xl border flex items-center gap-2.5 text-xs font-semibold ${
            statusMessage.type === 'success'
              ? 'bg-[var(--accent-dim)] border-[var(--accent-border)] text-[var(--color-accent)]'
              : 'bg-red-950/40 border-red-800/60 text-red-300'
          }`}
        >
          <WardenIcon name={statusMessage.type === 'success' ? 'check' : 'triangle-alert'} size={16} className="shrink-0" />
          <span className="truncate">{statusMessage.text}</span>
        </div>
      )}

      {/* Main Grid: File Explorer Left, Editor Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* File Browser Left Column */}
        <div className="lg:col-span-5 space-y-3 sm:space-y-4">
          <Card className="bg-[var(--bg-surface)] border-[var(--color-border)] p-3 sm:p-4">
            {/* Breadcrumb path */}
            <div className="flex items-center gap-1 text-xs font-mono bg-[var(--bg-main)] p-2 rounded-lg border border-[var(--color-border)] mb-3 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setCurrentPath('')}
                className="text-[var(--color-accent)] hover:underline font-bold px-1"
              >
                /
              </button>
              {pathParts.map((part, idx) => {
                const linkPath = pathParts.slice(0, idx + 1).join('/');
                return (
                  <React.Fragment key={linkPath}>
                    <span className="text-slate-600">/</span>
                    <button
                      onClick={() => setCurrentPath(linkPath)}
                      className="text-slate-200 hover:text-[var(--color-accent)] hover:underline font-semibold truncate max-w-[120px]"
                    >
                      {part}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>

            {/* File List */}
            {loadingFiles ? (
              <div className="py-12 text-center text-slate-400 text-xs font-mono">
                Loading server directory...
              </div>
            ) : files.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                No files found in directory
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]/50 max-h-[420px] sm:max-h-[500px] overflow-y-auto pr-1">
                {files.map((file) => (
                  <div
                    key={file.name}
                    className="py-2 px-2 flex items-center justify-between hover:bg-[var(--bg-card)] rounded-lg transition-colors group text-xs font-mono"
                  >
                    <div
                      onClick={() => {
                        if (file.is_dir) {
                          setCurrentPath(currentPath ? `${currentPath}/${file.name}` : file.name);
                        } else {
                          handleOpenFile(file.name);
                        }
                      }}
                      className="flex items-center gap-2 cursor-pointer truncate flex-1 min-w-0"
                    >
                      <WardenIcon
                        name={file.is_dir ? 'folder' : 'code'}
                        size={15}
                        className={file.is_dir ? 'text-amber-400 shrink-0' : 'text-sky-400 shrink-0'}
                      />
                      <span
                        className={`truncate ${
                          selectedFile === (currentPath ? `${currentPath}/${file.name}` : file.name)
                            ? 'text-[var(--color-accent)] font-bold'
                            : 'text-slate-200 group-hover:text-[var(--color-accent)]'
                        }`}
                      >
                        {file.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0 ml-2">
                      {!file.is_dir && <span className="text-[10px] text-slate-500">{formatFileSize(file.size)}</span>}
                      <button
                        onClick={() => handleDeleteFile(file.name)}
                        className="text-slate-500 hover:text-red-400 transition-colors p-1"
                        title="Delete file"
                      >
                        <WardenIcon name="trash" size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Text / Config Editor Right Column */}
        <div className="lg:col-span-7">
          <Card className="bg-[var(--bg-surface)] border-[var(--color-border)] p-3.5 sm:p-5 flex flex-col h-full space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2 text-xs font-mono min-w-0">
                <WardenIcon name="code" size={16} className="text-[var(--color-accent)] shrink-0" />
                <span className="text-slate-100 font-bold truncate">
                  {selectedFile || 'Select a file to edit'}
                </span>
                {fileContent !== originalContent && (
                  <span className="text-amber-400 text-[10px] font-bold uppercase bg-amber-950/60 border border-amber-800/80 px-1.5 py-0.5 rounded shrink-0">
                    Unsaved
                  </span>
                )}
              </div>

              {selectedFile && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveFile}
                  isLoading={savingFile}
                  disabled={fileContent === originalContent}
                  className="shrink-0"
                >
                  <WardenIcon name="save" size={14} className="text-[#0d0e11]" />
                  <span>Save</span>
                </Button>
              )}
            </div>

            {loadingContent ? (
              <div className="py-24 text-center text-slate-400 text-xs font-mono">
                Reading file content...
              </div>
            ) : selectedFile ? (
              <div className="flex-1 flex flex-col space-y-2 min-h-0">
                <textarea
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  rows={18}
                  className="w-full bg-[var(--bg-main)] text-slate-100 font-mono text-xs p-3 sm:p-4 rounded-xl border border-[var(--color-border)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50 resize-y leading-relaxed"
                  placeholder="File content..."
                />
              </div>
            ) : (
              <div className="py-20 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
                <WardenIcon name="code" size={32} className="text-slate-600" />
                <p>Click any file on the left to edit its content here.</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
