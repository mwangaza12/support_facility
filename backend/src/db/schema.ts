// drizzle/schema.ts
import {
  pgTable, text, timestamp, uuid,
  integer, boolean, jsonb, index, pgEnum
} from 'drizzle-orm/pg-core';

// ── Enums ─────────────────────────────────────────────────────────

export const genderEnum        = pgEnum('gender',         ['male', 'female', 'other', 'unknown']);
export const encounterStatusEnum = pgEnum('encounter_status', ['planned', 'in-progress', 'finished', 'cancelled']);
export const encounterTypeEnum = pgEnum('encounter_type', ['outpatient', 'inpatient', 'emergency', 'check-in', 'referral', 'virtual']);
export const roleEnum          = pgEnum('user_role',      ['doctor', 'nurse', 'receptionist', 'admin', 'pharmacist', 'lab_technician']);

export type UserRole = typeof roleEnum.enumValues[number];
// ── Users (Healthcare Practitioners) ─────────────────────────────

export const users = pgTable('users', {
  id:           uuid('id').primaryKey().defaultRandom(),
  email:        text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  firstName:    text('first_name').notNull(),
  lastName:     text('last_name').notNull(),
  role:         roleEnum('role').notNull(),
  facilityId:   text('facility_id').notNull(),
  isActive:     boolean('is_active').default(true),
  createdAt:    timestamp('created_at').defaultNow(),
  updatedAt:    timestamp('updated_at').defaultNow(),
}, (table) => ({
  emailIdx: index('users_email_idx').on(table.email),
}));

// ── Patients ──────────────────────────────────────────────────────
// Aligns with FHIR R4 Patient resource

export const patients = pgTable('patients', {
  id:          uuid('id').primaryKey().defaultRandom(),
  nupi:        text('nupi').notNull().unique(),          // National Unique Patient Identifier
  nationalId:  text('national_id').unique(),             // Kenya National ID
  firstName:   text('first_name').notNull(),
  lastName:    text('last_name').notNull(),
  middleName:  text('middle_name'),
  dateOfBirth: timestamp('date_of_birth').notNull(),
  gender:      genderEnum('gender').notNull(),
  phoneNumber: text('phone_number'),
  email:       text('email'),

  // FHIR Patient.address — stored as structured jsonb
  // { county, subCounty, ward, village, postalCode }
  address: jsonb('address'),

  // FHIR Patient.contact — next of kin / emergency contact
  // { name, relationship, phone, address }
  nextOfKin: jsonb('next_of_kin'),

  // Clinical extras
  bloodGroup:    text('blood_group'),                    // A+, B-, O+, etc.
  allergies:     jsonb('allergies'),                     // [{ substance, reaction, severity }]
  maritalStatus: text('marital_status'),                 // single, married, widowed, divorced

  // FHIR Patient.active
  active: boolean('active').default(true),

  // Set true when record was pulled from another facility via gateway
  isFederatedRecord: boolean('is_federated_record').default(false),

  // Which facility originally registered this patient
  registeredFacilityId: text('registered_facility_id'),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  nupiIdx:       index('patients_nupi_idx').on(table.nupi),
  nationalIdIdx: index('patients_national_id_idx').on(table.nationalId),
  nameIdx:       index('patients_name_idx').on(table.firstName, table.lastName),
}));

// ── Encounters ────────────────────────────────────────────────────
// Aligns with FHIR R4 Encounter resource

export const encounters = pgTable('encounters', {
  id:          uuid('id').primaryKey().defaultRandom(),
  patientId:   uuid('patient_id').notNull().references(() => patients.id),
  patientNupi: text('patient_nupi').notNull(),

  // FHIR Encounter.period
  encounterDate: timestamp('encounter_date').notNull(),
  dischargeDate: timestamp('discharge_date'),            // for inpatient

  encounterType: encounterTypeEnum('encounter_type').notNull(),
  status:        encounterStatusEnum('status').default('finished'),

  // FHIR Encounter.reasonCode
  chiefComplaint: text('chief_complaint'),

  // Clinical data — stored as jsonb for FHIR flexibility
  // vitalSigns: { temperature, bloodPressure, heartRate, respiratoryRate, oxygenSaturation, weight, height }
  vitalSigns: jsonb('vital_signs'),

  // diagnoses: [{ code, description, severity, system: 'ICD-10' }]
  diagnoses: jsonb('diagnoses').default([]),

  // medications: [{ name, dosage, frequency, duration, route }]
  medications: jsonb('medications'),

  // labResults: [{ test, result, unit, referenceRange, status }]
  labResults: jsonb('lab_results'),

  notes: text('notes'),

  // FHIR Encounter.participant
  practitionerId:   text('practitioner_id'),
  practitionerName: text('practitioner_name').default('Unknown'),

  facilityId: text('facility_id').notNull(),

  // Link to referral if this encounter was triggered by one
  referralId: uuid('referral_id'),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  patientIdx: index('encounters_patient_idx').on(table.patientId),
  nupiIdx:    index('encounters_nupi_idx').on(table.patientNupi),
  dateIdx:    index('encounters_date_idx').on(table.encounterDate),
}));

// ── Referrals ─────────────────────────────────────────────────────
// Local record of referrals — blockchain gets the immutable copy,
// this is for querying and UI display

export const referrals = pgTable('referrals', {
  id:             uuid('id').primaryKey().defaultRandom(),
  referralId:     text('referral_id').notNull().unique(), // matches blockchain referralId
  patientNupi:    text('patient_nupi').notNull(),
  fromFacilityId: text('from_facility_id').notNull(),
  toFacilityId:   text('to_facility_id').notNull(),
  reason:         text('reason').notNull(),
  urgency:        text('urgency').default('ROUTINE'),     // ROUTINE, URGENT, EMERGENCY
  status:         text('status').default('pending'),      // pending, accepted, completed, cancelled
  issuedBy:       text('issued_by'),
  notes:          text('notes'),
  blockIndex:     integer('block_index'),
  createdAt:      timestamp('created_at').defaultNow(),
  updatedAt:      timestamp('updated_at').defaultNow(),
}, (table) => ({
  nupiIdx: index('referrals_nupi_idx').on(table.patientNupi),
}));

// ── Consents ──────────────────────────────────────────────────────
// Local mirror of blockchain consent grants for fast querying

export const consents = pgTable('consents', {
  id:          uuid('id').primaryKey().defaultRandom(),
  consentId:   text('consent_id').notNull().unique(),     // matches blockchain consentId
  patientNupi: text('patient_nupi').notNull(),
  facilityId:  text('facility_id').notNull(),
  consentType: text('consent_type').notNull(),            // ID_VERIFIED, PIN_VERIFIED, NETWORK_DEFAULT
  status:      text('status').default('active'),          // active, revoked
  grantedAt:   timestamp('granted_at').defaultNow(),
  expiresAt:   timestamp('expires_at'),
  blockIndex:  integer('block_index'),
  createdAt:   timestamp('created_at').defaultNow(),
}, (table) => ({
  nupiIdx: index('consents_nupi_idx').on(table.patientNupi),
}));

// ── Audit Log ─────────────────────────────────────────────────────

export const auditLog = pgTable('audit_log', {
  id:           uuid('id').primaryKey().defaultRandom(),
  patientNupi:  text('patient_nupi').notNull(),
  userId:       text('user_id').notNull(),
  userName:     text('user_name').notNull(),
  action:       text('action').notNull(),                 // view, create, update, delete
  resource:     text('resource').notNull(),               // patient, encounter, referral
  resourceId:   text('resource_id'),
  consentMethod:text('consent_method'),                   // id_verified, pin_verified, network_default
  ipAddress:    text('ip_address'),
  createdAt:    timestamp('created_at').defaultNow(),
}, (table) => ({
  nupiIdx:  index('audit_nupi_idx').on(table.patientNupi),
  userIdx:  index('audit_user_idx').on(table.userId),
  dateIdx:  index('audit_date_idx').on(table.createdAt),
}));