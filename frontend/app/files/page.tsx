'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiClient } from '@/lib/api-client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Folder, File, Upload, Plus, Search, Download,
  Trash2, Edit3, ChevronRight, Home, Loader2
} from 'lucide-react';

interface FileItem {
  id: string;
  name: string;
  virtual_path: string;
  size: number;
  mime_type: string;
  is_directory: boolean;
  parent_id?: string;
  created_at: string;
}

export default function FilesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: 'My Files' }
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    fetchFiles();
  }, [user, currentFolder]);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const params = currentFolder ? { parent_id: currentFolder } : {};
      const res = await apiClient.get('/files', { params });
      setFiles(res.data || []);
    } catch (e) {
      console.error('Failed to fetch files:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) { fetchFiles(); return; }
    setLoading(true);
    try {
      const res = await apiClient.get('/files/search', { params: { q: searchQuery } });
      setFiles(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', fileList[0]);
    if (currentFolder) formData.append('parent_id', currentFolder);

    try {
      await apiClient.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      fetchFiles();
    } catch (e: any) {
      alert('Upload failed: ' + (e.response?.data?.message || 'Unknown error'));
    }
    finally { setUploading(false); }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await apiClient.post('/files/folder', { name: newFolderName, parent_id: currentFolder });
      setNewFolderName('');
      setShowNewFolder(false);
      fetchFiles();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await apiClient.delete(`/files/${id}`);
      fetchFiles();
    } catch (e) { console.error(e); }
  };

  const handleDownload = (id: string) => {
    const token = localStorage.getItem('accessToken');
    window.open(`http://localhost:8080/api/v1/files/${id}/download?token=${token}`, '_blank');
  };

  const handleRename = async (id: string, currentName: string) => {
    const newName = prompt('New name:', currentName);
    if (!newName || newName === currentName) return;
    try {
      await apiClient.put(`/files/${id}/rename`, { name: newName });
      fetchFiles();
    } catch (e) { console.error(e); }
  };

  const navigateToFolder = (folder: FileItem) => {
    setCurrentFolder(folder.id);
    setBreadcrumbs([...breadcrumbs, { id: folder.id, name: folder.name }]);
  };

  const navigateToBreadcrumb = (index: number) => {
    const crumb = breadcrumbs[index];
    setCurrentFolder(crumb.id);
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (file: FileItem) => {
    if (file.is_directory) return <Folder className="h-5 w-5 text-yellow-500" />;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext || ''))
      return <File className="h-5 w-5 text-blue-500" />;
    if (['mp4', 'avi', 'mov', 'mkv'].includes(ext || ''))
      return <File className="h-5 w-5 text-purple-500" />;
    return <File className="h-5 w-5 text-gray-500" />;
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">File Manager</h1>
          <div className="flex gap-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload
            </Button>
            <Button variant="outline" onClick={() => setShowNewFolder(!showNewFolder)}>
              <Plus className="h-4 w-4 mr-2" />
              New Folder
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button variant="outline" size="icon" onClick={handleSearch}>
            <Search className="h-4 w-4" />
          </Button>
        </div>

        {/* New folder input */}
        {showNewFolder && (
          <div className="flex gap-2">
            <Input
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            />
            <Button onClick={handleCreateFolder}>Create</Button>
            <Button variant="ghost" onClick={() => setShowNewFolder(false)}>Cancel</Button>
          </div>
        )}

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-sm">
          {breadcrumbs.map((crumb, i) => (
            <div key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <button
                onClick={() => navigateToBreadcrumb(i)}
                className="flex items-center gap-1 hover:text-primary transition-colors"
              >
                {i === 0 && <Home className="h-4 w-4" />}
                {crumb.name}
              </button>
            </div>
          ))}
        </div>

        {/* File list */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : files.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Folder className="h-12 w-12 mb-4" />
                <p>This folder is empty</p>
                <p className="text-sm">Upload files or create a folder to get started</p>
              </div>
            ) : (
              <div className="divide-y">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors group"
                  >
                    <div
                      className="flex items-center gap-3 flex-1 cursor-pointer"
                      onClick={() => file.is_directory && navigateToFolder(file)}
                    >
                      {getFileIcon(file)}
                      <div>
                        <p className="font-medium">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {file.is_directory ? 'Folder' : formatBytes(file.size)}
                          {' · '}{new Date(file.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!file.is_directory && (
                        <Button variant="ghost" size="icon" onClick={() => handleDownload(file.id)}>
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => handleRename(file.id, file.name)}>
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(file.id, file.name)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
