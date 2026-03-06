CREATE TYPE "public"."encounter_status" AS ENUM('planned', 'in-progress', 'finished', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."encounter_type" AS ENUM('outpatient', 'inpatient', 'emergency', 'check-in', 'referral', 'virtual');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('doctor', 'nurse', 'receptionist', 'admin', 'pharmacist', 'lab_technician');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_nupi" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" text,
	"consent_method" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consent_id" text NOT NULL,
	"patient_nupi" text NOT NULL,
	"facility_id" text NOT NULL,
	"consent_type" text NOT NULL,
	"status" text DEFAULT 'active',
	"granted_at" timestamp DEFAULT now(),
	"expires_at" timestamp,
	"block_index" integer,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "consents_consent_id_unique" UNIQUE("consent_id")
);
--> statement-breakpoint
CREATE TABLE "encounters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"patient_nupi" text NOT NULL,
	"encounter_date" timestamp NOT NULL,
	"discharge_date" timestamp,
	"encounter_type" "encounter_type" NOT NULL,
	"status" "encounter_status" DEFAULT 'finished',
	"chief_complaint" text,
	"vital_signs" jsonb,
	"diagnoses" jsonb DEFAULT '[]'::jsonb,
	"medications" jsonb,
	"lab_results" jsonb,
	"notes" text,
	"practitioner_id" text,
	"practitioner_name" text DEFAULT 'Unknown',
	"facility_id" text NOT NULL,
	"referral_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nupi" text NOT NULL,
	"national_id" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"middle_name" text,
	"date_of_birth" timestamp NOT NULL,
	"gender" "gender" NOT NULL,
	"phone_number" text,
	"email" text,
	"address" jsonb,
	"next_of_kin" jsonb,
	"blood_group" text,
	"allergies" jsonb,
	"marital_status" text,
	"active" boolean DEFAULT true,
	"is_federated_record" boolean DEFAULT false,
	"registered_facility_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "patients_nupi_unique" UNIQUE("nupi"),
	CONSTRAINT "patients_national_id_unique" UNIQUE("national_id")
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_id" text NOT NULL,
	"patient_nupi" text NOT NULL,
	"from_facility_id" text NOT NULL,
	"to_facility_id" text NOT NULL,
	"reason" text NOT NULL,
	"urgency" text DEFAULT 'ROUTINE',
	"status" text DEFAULT 'pending',
	"issued_by" text,
	"notes" text,
	"block_index" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "referrals_referral_id_unique" UNIQUE("referral_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"facility_id" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_nupi_idx" ON "audit_log" USING btree ("patient_nupi");--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_date_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "consents_nupi_idx" ON "consents" USING btree ("patient_nupi");--> statement-breakpoint
CREATE INDEX "encounters_patient_idx" ON "encounters" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "encounters_nupi_idx" ON "encounters" USING btree ("patient_nupi");--> statement-breakpoint
CREATE INDEX "encounters_date_idx" ON "encounters" USING btree ("encounter_date");--> statement-breakpoint
CREATE INDEX "patients_nupi_idx" ON "patients" USING btree ("nupi");--> statement-breakpoint
CREATE INDEX "patients_national_id_idx" ON "patients" USING btree ("national_id");--> statement-breakpoint
CREATE INDEX "patients_name_idx" ON "patients" USING btree ("first_name","last_name");--> statement-breakpoint
CREATE INDEX "referrals_nupi_idx" ON "referrals" USING btree ("patient_nupi");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");