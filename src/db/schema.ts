import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ───────────────────────── Comptes & sessions ─────────────────────────
 * Un profil = la personne qui s'inscrit (le propriétaire). Elle peut
 * posséder plusieurs business (multi-tenant côté propriétaire aussi).
 */

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  phone: text("phone"),
  // active | suspended
  status: text("status").notNull().default("active"),
  emailVerified: boolean("email_verified").notNull().default(false),
  preferredLanguage: text("preferred_language").notNull().default("fr"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("profiles_email_key").on(sql`lower(${t.email})`)]);

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

/* ───────────────────────────── Le tenant ──────────────────────────────
 * `publicKey` est l'identifiant que le client colle dans son <script> :
 * il est public par conception. Ce qui protège le compte, c'est
 * `allowedDomains` (contrôle d'origine) + le solde de minutes, jamais le
 * secret de la clé.
 */

export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: uuid("owner_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  publicKey: text("public_key").notNull(),
  // hopital | immobilier | commerce | dentaire | salon | hotel | juridique
  // | automobile | services | restaurant | fitness | autre
  industry: text("industry").notNull().default("autre"),
  description: text("description"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  websiteUrl: text("website_url"),
  timezone: text("timezone").notNull().default("Africa/Abidjan"),
  locale: text("locale").notNull().default("fr"),
  /** Domaines autorisés à charger le widget. Vide = tout refuser sauf notre app. */
  allowedDomains: jsonb("allowed_domains").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /** Solde en SECONDES de conversation. Décrémenté par le compteur d'usage. */
  secondsBalance: integer("seconds_balance").notNull().default(0),
  plan: text("plan").notNull().default("essai"),
  // active | suspended
  status: text("status").notNull().default("active"),
  brandColor: text("brand_color").notNull().default("#1e4db7"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("businesses_slug_key").on(t.slug),
  uniqueIndex("businesses_public_key_key").on(t.publicKey),
  index("businesses_owner_idx").on(t.ownerId),
]);

/* ─────────────────────────── Agents vocaux ───────────────────────────
 * Plusieurs agents par business (réception, ventes, support…), chacun
 * avec sa voix, ses consignes et ses outils activés.
 */

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // receptionniste | commercial | support
  role: text("role").notNull().default("receptionniste"),
  /** Voix OpenAI : alloy ash ballad coral echo sage shimmer verse marin cedar */
  voice: text("voice").notNull().default("marin"),
  greeting: text("greeting"),
  /** Consignes métier ajoutées au prompt système généré. */
  instructions: text("instructions"),
  /** Noms des outils activés — voir src/lib/tools.ts */
  enabledTools: jsonb("enabled_tools").$type<string[]>().notNull()
    .default(sql`'["book_appointment","capture_lead","lookup_knowledge","transfer_to_human"]'::jsonb`),
  /** Numéro vers lequel transférer un appel humain. */
  transferPhone: text("transfer_phone"),
  isDefault: boolean("is_default").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("agents_business_idx").on(t.businessId)]);

/* ─────────────────── Connaissance métier & catalogue ──────────────────
 * Pas d'embeddings : la base est petite par tenant et injectée dans le
 * prompt. `lookup_knowledge` fait une recherche plein texte Postgres
 * quand la base dépasse la taille du prompt.
 */

export const knowledgeItems = pgTable("knowledge_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /** true = toujours injecté dans le prompt (horaires, adresse, tarifs clés). */
  pinned: boolean("pinned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("knowledge_business_idx").on(t.businessId)]);

export const services = pgTable("services", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  price: integer("price"),
  currency: text("currency").notNull().default("XOF"),
  active: boolean("active").notNull().default(true),
}, (t) => [index("services_business_idx").on(t.businessId)]);

export const businessHours = pgTable("business_hours", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  /** 0 = dimanche … 6 = samedi */
  dayOfWeek: integer("day_of_week").notNull(),
  /** "08:30" */
  opensAt: text("opens_at").notNull().default("08:00"),
  closesAt: text("closes_at").notNull().default("18:00"),
  closed: boolean("closed").notNull().default(false),
}, (t) => [uniqueIndex("business_hours_day_key").on(t.businessId, t.dayOfWeek)]);

/* ──────────────────────── Conversations vocales ───────────────────────── */

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  /** web = widget navigateur. Réservé pour une future couche téléphonie. */
  channel: text("channel").notNull().default("web"),
  // active | ended | failed
  status: text("status").notNull().default("active"),
  /** Identifiant anonyme du visiteur, posé par le widget (localStorage). */
  visitorRef: text("visitor_ref"),
  originDomain: text("origin_domain"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds").notNull().default(0),
  /** rdv_pris | lead_capture | renseignement | transfert | abandon */
  outcome: text("outcome"),
  summary: text("summary"),
}, (t) => [
  index("conversations_business_idx").on(t.businessId),
  index("conversations_started_idx").on(t.startedAt),
]);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  // user | assistant | tool
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("messages_conversation_idx").on(t.conversationId)]);

/* ─────────────────────── Sorties métier de l'agent ────────────────────── */

export const appointments = pgTable("appointments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  // pending | confirmed | cancelled | completed | no_show
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  /** Jeton à usage unique pour confirmer/annuler depuis un lien e-mail. */
  confirmToken: text("confirm_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("appointments_business_idx").on(t.businessId),
  index("appointments_scheduled_idx").on(t.scheduledAt),
  uniqueIndex("appointments_confirm_token_key").on(t.confirmToken),
]);

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  name: text("name"),
  phone: text("phone"),
  email: text("email"),
  /** Ce que le prospect veut, dans ses mots. */
  intent: text("intent"),
  /** Réponses de qualification libres, collectées par l'agent. */
  qualification: jsonb("qualification").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
  /** 0-100, calculé par l'agent. */
  score: integer("score").notNull().default(0),
  // nouveau | contacte | qualifie | gagne | perdu
  status: text("status").notNull().default("nouveau"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("leads_business_idx").on(t.businessId)]);

/* ──────────────── Compteur d'usage (facturation à la minute) ─────────────
 * Registre append-only : chaque débit de secondes y laisse une trace, ce
 * qui permet de recalculer un solde et d'auditer une facture.
 */

export const usageEvents = pgTable("usage_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  /** Secondes débitées (positif) ou créditées (négatif) sur le solde. */
  seconds: integer("seconds").notNull(),
  reason: text("reason").notNull().default("voice"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("usage_business_idx").on(t.businessId, t.createdAt)]);

/* ──────────────────────── Facturation GeniusPay ─────────────────────────
 * Une ligne `payments` est créée AVANT la redirection vers GeniusPay.
 * Seul le webhook vérifié crédite les minutes — jamais le checkout.
 */

export const payments = pgTable("payments", {
  reference: text("reference").primaryKey(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  // mobile (GeniusPay)
  provider: text("provider").notNull().default("mobile"),
  plan: text("plan").notNull(),
  /** Secondes achetées. */
  seconds: integer("seconds").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("XOF"),
  // pending | paid | failed
  status: text("status").notNull().default("pending"),
  providerTxId: text("provider_tx_id"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("payments_business_idx").on(t.businessId)]);

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: text("invoice_number").notNull(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  plan: text("plan").notNull(),
  seconds: integer("seconds").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("XOF"),
  provider: text("provider").notNull().default("mobile"),
  status: text("status").notNull().default("paid"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("invoices_number_key").on(t.invoiceNumber)]);

export type Profile = typeof profiles.$inferSelect;
export type Business = typeof businesses.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type KnowledgeItem = typeof knowledgeItems.$inferSelect;
export type Service = typeof services.$inferSelect;
export type BusinessHour = typeof businessHours.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type Lead = typeof leads.$inferSelect;
