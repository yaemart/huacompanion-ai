export interface Client {
  id: number;
  reference: string;
  kind: "individual" | "company";
  displayName: string;
  language: "en" | "zh";
  countryCode: string | null;
  teamID: number;
  ownerID: number | null;
  status: "active" | "archived";
  revision: number;
}
export interface Contact {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  isPrimary: boolean;
  status: "active" | "archived";
  revision: number;
}
export interface Link {
  linkID: number;
  linkRevision: number;
  inquiryID: number;
  reference: string;
  name: string;
  serviceCase: { id: number; title: string; stage: string } | null;
}
export interface Candidate {
  inquiryID: number;
  reference: string;
  name: string;
  expectedLinkRevision: number;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
export interface Options {
  role: "admin" | "manager" | "operations";
  teamID: number | null;
  teams: { id: number; name: string }[];
  owners: { id: number; name: string; teamID: number }[];
}
export interface View {
  client: Client;
  contacts: Page<Contact>;
  links: Page<Link>;
  candidates: Page<Candidate>;
}
export interface Draft {
  action: string;
  title: string;
  base: Record<string, unknown>;
  values: Record<string, string>;
}
