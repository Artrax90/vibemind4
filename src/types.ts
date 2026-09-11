export type Note = {
  id: string;
  title: string;
  content: string;
  folderId?: string;
  folder_id?: string;
  updatedAt?: string;
  updated_at?: string;
  createdAt?: string;
  created_at?: string;
  permission?: 'owner' | 'edit' | 'read';
  isPinned?: boolean;
  is_pinned?: boolean;
  isShared?: boolean;
  is_shared?: boolean;
  isSharedByMe?: boolean;
  isPublished?: boolean;
  publishedExpiresAt?: string | null;
  ownerUsername?: string;
  tags?: string[];
  is_dirty?: number;
  folderIsProtected?: boolean;
};

export type Folder = {
  id: string;
  name: string;
  parentId?: string;
  parent_id?: string;
  permission?: 'owner' | 'edit' | 'read';
  isShared?: boolean;
  is_shared?: boolean;
  isSharedByMe?: boolean;
  isProtected?: boolean;
  is_protected?: boolean;
  ownerUsername?: string;
  is_dirty?: number;
  created_at?: string;
  updated_at?: string;
};

