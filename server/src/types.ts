export interface UserRow {
  id: string;
  name: string;
  email: string;
  color: string;
  role_label: string;
  created_at: string;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  color: string;
  roleLabel: string;
}

export type ShareRole = "editor" | "viewer";
export type DocumentRole = "owner" | "editor" | "viewer";

export interface DocumentRow {
  id: string;
  title: string;
  content_json: string;
  plain_text: string;
  owner_id: string;
  revision: number;
  created_at: string;
  updated_at: string;
  updated_by: string;
}

export interface DocumentAccessRow extends DocumentRow {
  owner_name: string;
  owner_email: string;
  owner_color: string;
  owner_role_label: string;
  updated_by_name: string;
  updated_by_email: string;
  updated_by_color: string;
  updated_by_role_label: string;
  access: "owner" | "shared";
  share_role?: ShareRole | null;
  share_count: number;
}

export interface ShareUserRow extends UserRow {
  role: ShareRole;
  shared_at: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserRow;
    }
  }
}

export function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    color: user.color,
    roleLabel: user.role_label,
  };
}
