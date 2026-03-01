// drizzle/schema.ts
import { pgTable, text, timestamp, uuid, integer, boolean, jsonb, index } from 'drizzle-orm/pg-core';

// Users (Healthcare Practitioners)
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  role: text('role').notNull(), // 'doctor', 'nurse', 'receptionist', 'admin'
  facilityId: text('facility_id').notNull(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  emailIdx: index('users_email_idx').on(table.email),
}));

// Patients
export const patients = pgTable('patients', {
  id: uuid('id').primaryKey().defaultRandom(),
  nupi: text('nupi').notNull().unique(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  middleName: text('middle_name'),
  dateOfBirth: timestamp('date_of_birth').notNull(),
  gender: text('gender').notNull(),
  nationalId: text('national_id'),
  phoneNumber: text('phone_number'),
  email: text('email'),
  address: jsonb('address'),
  isFederatedRecord: boolean('is_federated_record').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  nupiIdx: index('patients_nupi_idx').on(table.nupi),
}));

// Encounters
export const encounters = pgTable('encounters', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patients.id),
  patientNupi: text('patient_nupi').notNull(),
  encounterDate: timestamp('encounter_date').notNull(),
  encounterType: text('encounter_type').notNull(),
  chiefComplaint: text('chief_complaint'),
  vitalSigns: jsonb('vital_signs'),
  diagnoses: jsonb('diagnoses').notNull(),
  medications: jsonb('medications'),
  notes: text('notes'),
  practitionerId: text('practitioner_id'),
  practitionerName: text('practitioner_name').notNull(),
  facilityId: text('facility_id').notNull(),
  status: text('status').default('active'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  patientIdx: index('encounters_patient_idx').on(table.patientId),
  nupiIdx: index('encounters_nupi_idx').on(table.patientNupi),
}));

// OTP Consent Requests
export const otpRequests = pgTable('otp_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientNupi: text('patient_nupi').notNull(),
  patientPhone: text('patient_phone').notNull(),
  requestingUser: text('requesting_user').notNull(),
  targetFacility: text('target_facility').notNull(),
  otp: text('otp').notNull(),
  otpHash: text('otp_hash').notNull(),
  attempts: integer('attempts').default(0),
  status: text('status').default('pending'), // 'pending', 'verified', 'expired'
  verifiedAt: timestamp('verified_at'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  nupiIdx: index('otp_nupi_idx').on(table.patientNupi),
}));

// Audit Log
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientNupi: text('patient_nupi').notNull(),
  userId: text('user_id').notNull(),
  userName: text('user_name').notNull(),
  action: text('action').notNull(), // 'view', 'create', 'update'
  resource: text('resource').notNull(), // 'patient', 'encounter'
  resourceId: text('resource_id'),
  consentMethod: text('consent_method'), // 'otp', 'standing', 'emergency'
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  nupiIdx: index('audit_nupi_idx').on(table.patientNupi),
}));
