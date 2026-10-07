-- GeniusVoice — installation complète du schéma.
-- À exécuter une fois dans l'éditeur SQL de Supabase.
-- Généré depuis src/db/schema.ts (drizzle-kit generate), plus les
-- index que Drizzle n'exprime pas.

CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'receptionniste' NOT NULL,
	"voice" text DEFAULT 'marin' NOT NULL,
	"greeting" text,
	"instructions" text,
	"enabled_tools" jsonb DEFAULT '["book_appointment","capture_lead","lookup_knowledge","transfer_to_human"]'::jsonb NOT NULL,
	"transfer_phone" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"conversation_id" uuid,
	"service_id" uuid,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"customer_email" text,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"confirm_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "business_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"opens_at" text DEFAULT '08:00' NOT NULL,
	"closes_at" text DEFAULT '18:00' NOT NULL,
	"closed" boolean DEFAULT false NOT NULL
);

CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"public_key" text NOT NULL,
	"industry" text DEFAULT 'autre' NOT NULL,
	"description" text,
	"phone" text,
	"email" text,
	"address" text,
	"website_url" text,
	"timezone" text DEFAULT 'Africa/Abidjan' NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"allowed_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seconds_balance" integer DEFAULT 0 NOT NULL,
	"plan" text DEFAULT 'essai' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"brand_color" text DEFAULT '#1e4db7' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"agent_id" uuid,
	"channel" text DEFAULT 'web' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"visitor_ref" text,
	"origin_domain" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"outcome" text,
	"summary" text
);

CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text NOT NULL,
	"user_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"plan" text NOT NULL,
	"seconds" integer NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"provider" text DEFAULT 'mobile' NOT NULL,
	"status" text DEFAULT 'paid' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "knowledge_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"conversation_id" uuid,
	"name" text,
	"phone" text,
	"email" text,
	"intent" text,
	"qualification" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'nouveau' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "payments" (
	"reference" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"provider" text DEFAULT 'mobile' NOT NULL,
	"plan" text NOT NULL,
	"seconds" integer NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_tx_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text,
	"phone" text,
	"status" text DEFAULT 'active' NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"preferred_language" text DEFAULT 'fr' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"price" integer,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);

CREATE TABLE "sessions" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"conversation_id" uuid,
	"seconds" integer NOT NULL,
	"reason" text DEFAULT 'voice' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "agents" ADD CONSTRAINT "agents_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "leads" ADD CONSTRAINT "leads_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "leads" ADD CONSTRAINT "leads_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "services" ADD CONSTRAINT "services_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "agents_business_idx" ON "agents" USING btree ("business_id");
CREATE INDEX "appointments_business_idx" ON "appointments" USING btree ("business_id");
CREATE INDEX "appointments_scheduled_idx" ON "appointments" USING btree ("scheduled_at");
CREATE UNIQUE INDEX "appointments_confirm_token_key" ON "appointments" USING btree ("confirm_token");
CREATE UNIQUE INDEX "business_hours_day_key" ON "business_hours" USING btree ("business_id","day_of_week");
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses" USING btree ("slug");
CREATE UNIQUE INDEX "businesses_public_key_key" ON "businesses" USING btree ("public_key");
CREATE INDEX "businesses_owner_idx" ON "businesses" USING btree ("owner_id");
CREATE INDEX "conversations_business_idx" ON "conversations" USING btree ("business_id");
CREATE INDEX "conversations_started_idx" ON "conversations" USING btree ("started_at");
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices" USING btree ("invoice_number");
CREATE INDEX "knowledge_business_idx" ON "knowledge_items" USING btree ("business_id");
CREATE INDEX "leads_business_idx" ON "leads" USING btree ("business_id");
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id");
CREATE INDEX "payments_business_idx" ON "payments" USING btree ("business_id");
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles" USING btree (lower("email"));
CREATE INDEX "services_business_idx" ON "services" USING btree ("business_id");
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");
CREATE INDEX "usage_business_idx" ON "usage_events" USING btree ("business_id","created_at");
-- ── Recherche plein texte de la base de connaissances ──────────────────
-- lookup_knowledge interroge to_tsvector('french', titre || contenu).
-- Sans cet index, chaque question de client déclenche un parcours complet
-- de la table.
CREATE INDEX IF NOT EXISTS knowledge_fts_idx
  ON knowledge_items
  USING gin (to_tsvector('french', title || ' ' || content));

-- ── Chevauchement de rendez-vous ──────────────────────────────────────
-- book_appointment vérifie les collisions par plage horaire.
CREATE INDEX IF NOT EXISTS appointments_overlap_idx
  ON appointments (business_id, scheduled_at)
  WHERE status IN ('pending', 'confirmed');
