-- CreateEnum
CREATE TYPE "AcademicCycleStatus" AS ENUM ('PLANNED', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "GradeLevel" AS ENUM ('PRE_PRIMARY', 'PRIMARY', 'SECONDARY', 'OTHER');

-- CreateEnum
CREATE TYPE "ApplicationType" AS ENUM ('NEW_ENROLLMENT', 'RE_ENROLLMENT', 'TRANSFER');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'INCOMPLETE', 'APPROVED', 'REJECTED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'GRADUATED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE', 'NOT_SPECIFIED');

-- CreateEnum
CREATE TYPE "GuardianRelationship" AS ENUM ('MOTHER', 'FATHER', 'TUTOR', 'GRANDPARENT', 'SIBLING', 'OTHER');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('MARRIED', 'PARTNERSHIP', 'SINGLE', 'SEPARATED', 'DIVORCED', 'WIDOWED', 'NOT_SPECIFIED');

-- CreateEnum
CREATE TYPE "Laterality" AS ENUM ('LEFT', 'RIGHT', 'AMBIDEXTROUS', 'NOT_SPECIFIED');

-- CreateEnum
CREATE TYPE "ReligionType" AS ENUM ('CATHOLIC', 'NON_PRACTICING_CATHOLIC', 'OTHER', 'NOT_SPECIFIED');

-- CreateEnum
CREATE TYPE "SponsorType" AS ENUM ('INDIVIDUAL', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "SponsorshipStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DonationFrequency" AS ENUM ('ONE_TIME', 'MONTHLY');

-- CreateEnum
CREATE TYPE "DonationStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('ENROLLMENT_FORM', 'SPONSOR_AUTHORIZATION', 'STUDENT_ID_CARD');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('GENERATED', 'SIGNED', 'PRINTED', 'VOID');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "UserTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'VIEW', 'EXPORT', 'LOGIN', 'LOGOUT', 'GENERATE', 'PRINT');

-- CreateTable
CREATE TABLE "schools" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "legal_name" VARCHAR(200),
    "logo_path" VARCHAR(500),
    "email" VARCHAR(254),
    "phone" VARCHAR(30),
    "website" VARCHAR(250),
    "address" TEXT,
    "municipality" VARCHAR(100),
    "department" VARCHAR(100),
    "country" VARCHAR(100) NOT NULL DEFAULT 'Guatemala',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_cycles" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "year" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "AcademicCycleStatus" NOT NULL DEFAULT 'PLANNED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "academic_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "level" "GradeLevel" NOT NULL,
    "display_order" INTEGER NOT NULL,
    "min_age" INTEGER,
    "max_age" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_sections" (
    "id" UUID NOT NULL,
    "academic_cycle_id" UUID NOT NULL,
    "grade_id" UUID NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "teacher_name" VARCHAR(160),
    "room" VARCHAR(50),
    "capacity" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "class_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL,
    "lot" VARCHAR(30),
    "block" VARCHAR(30),
    "sector" VARCHAR(80),
    "zone" VARCHAR(20),
    "neighborhood" VARCHAR(120),
    "village" VARCHAR(120),
    "municipality" VARCHAR(100),
    "department" VARCHAR(100),
    "country" VARCHAR(100) NOT NULL DEFAULT 'Guatemala',
    "full_address" TEXT,
    "reference" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_code" VARCHAR(40) NOT NULL,
    "given_names" VARCHAR(120) NOT NULL,
    "first_surname" VARCHAR(80) NOT NULL,
    "second_surname" VARCHAR(80),
    "usual_name" VARCHAR(120),
    "search_name" VARCHAR(300) NOT NULL,
    "birth_place" VARCHAR(150),
    "birth_date" DATE,
    "cui_encrypted" TEXT,
    "cui_hash" VARCHAR(64),
    "home_phone" VARCHAR(30),
    "sex" "Sex" NOT NULL DEFAULT 'NOT_SPECIFIED',
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "address_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" UUID NOT NULL,
    "given_names" VARCHAR(120) NOT NULL,
    "first_surname" VARCHAR(80) NOT NULL,
    "second_surname" VARCHAR(80),
    "married_surname" VARCHAR(80),
    "search_name" VARCHAR(350) NOT NULL,
    "birth_place" VARCHAR(150),
    "birth_date" DATE,
    "marital_status" "MaritalStatus" NOT NULL DEFAULT 'NOT_SPECIFIED',
    "dpi_encrypted" TEXT,
    "dpi_hash" VARCHAR(64),
    "dpi_issued_municipality" VARCHAR(100),
    "dpi_issued_department" VARCHAR(100),
    "home_phone" VARCHAR(30),
    "mobile_phone" VARCHAR(30),
    "phone_carrier" VARCHAR(60),
    "primary_email" VARCHAR(254),
    "secondary_email" VARCHAR(254),
    "address_id" UUID,
    "workplace_name" VARCHAR(180),
    "workplace_phone" VARCHAR(30),
    "occupation" VARCHAR(120),
    "education_level" VARCHAR(120),
    "religion" "ReligionType" NOT NULL DEFAULT 'NOT_SPECIFIED',
    "other_religion" VARCHAR(120),
    "baptized" BOOLEAN,
    "first_communion" BOOLEAN,
    "confirmed" BOOLEAN,
    "married_by_church" BOOLEAN,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_guardians" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "relationship" "GuardianRelationship" NOT NULL,
    "custom_relationship" VARCHAR(80),
    "lives_with_student" BOOLEAN NOT NULL DEFAULT false,
    "primary_contact" BOOLEAN NOT NULL DEFAULT false,
    "legal_representative" BOOLEAN NOT NULL DEFAULT false,
    "authorized_for_school_procedures" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "start_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_cycle_id" UUID NOT NULL,
    "grade_id" UUID NOT NULL,
    "class_section_id" UUID,
    "application_type" "ApplicationType" NOT NULL,
    "request_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'DRAFT',
    "message_contact_name" VARCHAR(160),
    "message_contact_phone" VARCHAR(30),
    "message_contact_relationship" VARCHAR(80),
    "may_leave_alone" BOOLEAN NOT NULL DEFAULT false,
    "signer_name" VARCHAR(160),
    "signer_relationship" VARCHAR(80),
    "signed_at" TIMESTAMPTZ(3),
    "approved_at" TIMESTAMPTZ(3),
    "approved_by_user_id" UUID,
    "rejection_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_profiles" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "lives_with_mother" BOOLEAN NOT NULL DEFAULT false,
    "lives_with_father" BOOLEAN NOT NULL DEFAULT false,
    "lives_with_siblings" BOOLEAN NOT NULL DEFAULT false,
    "lives_with_uncles" BOOLEAN NOT NULL DEFAULT false,
    "lives_with_friends" BOOLEAN NOT NULL DEFAULT false,
    "lives_with_grandparents" BOOLEAN NOT NULL DEFAULT false,
    "lives_with_other" BOOLEAN NOT NULL DEFAULT false,
    "other_details" VARCHAR(250),
    "household_size" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "household_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_siblings" (
    "id" UUID NOT NULL,
    "household_profile_id" UUID NOT NULL,
    "name" VARCHAR(160),
    "sex" "Sex" NOT NULL DEFAULT 'NOT_SPECIFIED',
    "age_at_registration" INTEGER,
    "enrolled_at_this_school" BOOLEAN,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_siblings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_profiles" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "blood_type" VARCHAR(10),
    "blood_type_unknown" BOOLEAN NOT NULL DEFAULT false,
    "has_disease_or_allergy" BOOLEAN NOT NULL DEFAULT false,
    "disease_or_allergy_details" TEXT,
    "has_medication_allergy" BOOLEAN NOT NULL DEFAULT false,
    "medication_allergy_details" TEXT,
    "vaccinations_complete" BOOLEAN,
    "missing_vaccines" TEXT,
    "laterality" "Laterality" NOT NULL DEFAULT 'NOT_SPECIFIED',
    "emergency_medical_notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "medical_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "religious_profiles" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "religion" "ReligionType" NOT NULL DEFAULT 'NOT_SPECIFIED',
    "other_religion" VARCHAR(120),
    "baptized" BOOLEAN,
    "first_communion" BOOLEAN,
    "confirmed" BOOLEAN,
    "wants_first_communion_catechesis" BOOLEAN,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "religious_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authorized_pickups" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "relationship" VARCHAR(80) NOT NULL,
    "identifier_encrypted" TEXT,
    "identifier_hash" VARCHAR(64),
    "phone" VARCHAR(30),
    "sort_order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "authorized_pickups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_photos" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "storage_path" VARCHAR(500) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size_bytes" INTEGER,
    "checksum_sha256" VARCHAR(64),
    "crop_data" JSONB,
    "captured_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "uploaded_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsors" (
    "id" UUID NOT NULL,
    "type" "SponsorType" NOT NULL DEFAULT 'INDIVIDUAL',
    "given_names" VARCHAR(120),
    "first_surname" VARCHAR(80),
    "second_surname" VARCHAR(80),
    "organization_name" VARCHAR(200),
    "search_name" VARCHAR(350) NOT NULL,
    "birthday" DATE,
    "email" VARCHAR(254),
    "phone" VARCHAR(30),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsor_receipt_profiles" (
    "id" UUID NOT NULL,
    "sponsor_id" UUID NOT NULL,
    "receipt_name" VARCHAR(200) NOT NULL,
    "nit_encrypted" TEXT,
    "nit_hash" VARCHAR(64),
    "fiscal_address" TEXT,
    "receipt_email" VARCHAR(254),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sponsor_receipt_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsorships" (
    "id" UUID NOT NULL,
    "sponsor_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "SponsorshipStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sponsorships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donation_commitments" (
    "id" UUID NOT NULL,
    "sponsorship_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'GTQ',
    "frequency" "DonationFrequency" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "DonationStatus" NOT NULL DEFAULT 'PENDING',
    "payment_provider" VARCHAR(100),
    "payment_reference" VARCHAR(255),
    "card_brand" VARCHAR(30),
    "card_last_four" CHAR(4),
    "authorization_accepted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "donation_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_templates" (
    "id" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "version" INTEGER NOT NULL,
    "template_path" VARCHAR(500) NOT NULL,
    "checksum_sha256" VARCHAR(64),
    "configuration" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_documents" (
    "id" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'GENERATED',
    "student_id" UUID,
    "enrollment_id" UUID,
    "sponsorship_id" UUID,
    "template_id" UUID NOT NULL,
    "storage_path" VARCHAR(500) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    "checksum_sha256" VARCHAR(64),
    "data_snapshot" JSONB NOT NULL,
    "generated_by_user_id" UUID,
    "generated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signed_at" TIMESTAMPTZ(3),
    "printed_at" TIMESTAMPTZ(3),
    "voided_at" TIMESTAMPTZ(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "generated_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(160) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "ip_address" VARCHAR(64),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "UserTokenType" NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID,
    "action" "AuditAction" NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" VARCHAR(64),
    "before_data" JSONB,
    "after_data" JSONB,
    "ip_address" VARCHAR(64),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schools_code_key" ON "schools"("code");

-- CreateIndex
CREATE INDEX "academic_cycles_school_id_status_idx" ON "academic_cycles"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "academic_cycles_school_id_year_key" ON "academic_cycles"("school_id", "year");

-- CreateIndex
CREATE INDEX "grades_school_id_level_display_order_idx" ON "grades"("school_id", "level", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "grades_school_id_code_key" ON "grades"("school_id", "code");

-- CreateIndex
CREATE INDEX "class_sections_academic_cycle_id_grade_id_idx" ON "class_sections"("academic_cycle_id", "grade_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_sections_academic_cycle_id_grade_id_name_key" ON "class_sections"("academic_cycle_id", "grade_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "students_cui_hash_key" ON "students"("cui_hash");

-- CreateIndex
CREATE INDEX "students_school_id_status_idx" ON "students"("school_id", "status");

-- CreateIndex
CREATE INDEX "students_first_surname_second_surname_given_names_idx" ON "students"("first_surname", "second_surname", "given_names");

-- CreateIndex
CREATE INDEX "students_search_name_idx" ON "students"("search_name");

-- CreateIndex
CREATE UNIQUE INDEX "students_school_id_student_code_key" ON "students"("school_id", "student_code");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_dpi_hash_key" ON "guardians"("dpi_hash");

-- CreateIndex
CREATE INDEX "guardians_first_surname_second_surname_given_names_idx" ON "guardians"("first_surname", "second_surname", "given_names");

-- CreateIndex
CREATE INDEX "guardians_search_name_idx" ON "guardians"("search_name");

-- CreateIndex
CREATE INDEX "student_guardians_guardian_id_active_idx" ON "student_guardians"("guardian_id", "active");

-- CreateIndex
CREATE INDEX "student_guardians_student_id_primary_contact_idx" ON "student_guardians"("student_id", "primary_contact");

-- CreateIndex
CREATE UNIQUE INDEX "student_guardians_student_id_guardian_id_relationship_key" ON "student_guardians"("student_id", "guardian_id", "relationship");

-- CreateIndex
CREATE INDEX "enrollments_academic_cycle_id_grade_id_status_idx" ON "enrollments"("academic_cycle_id", "grade_id", "status");

-- CreateIndex
CREATE INDEX "enrollments_class_section_id_idx" ON "enrollments"("class_section_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_student_id_academic_cycle_id_key" ON "enrollments"("student_id", "academic_cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "household_profiles_enrollment_id_key" ON "household_profiles"("enrollment_id");

-- CreateIndex
CREATE INDEX "student_siblings_household_profile_id_idx" ON "student_siblings"("household_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "medical_profiles_enrollment_id_key" ON "medical_profiles"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "religious_profiles_enrollment_id_key" ON "religious_profiles"("enrollment_id");

-- CreateIndex
CREATE INDEX "authorized_pickups_enrollment_id_active_idx" ON "authorized_pickups"("enrollment_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "authorized_pickups_enrollment_id_sort_order_key" ON "authorized_pickups"("enrollment_id", "sort_order");

-- CreateIndex
CREATE INDEX "student_photos_student_id_is_active_idx" ON "student_photos"("student_id", "is_active");

-- CreateIndex
CREATE INDEX "sponsors_search_name_idx" ON "sponsors"("search_name");

-- CreateIndex
CREATE INDEX "sponsors_active_idx" ON "sponsors"("active");

-- CreateIndex
CREATE UNIQUE INDEX "sponsor_receipt_profiles_sponsor_id_key" ON "sponsor_receipt_profiles"("sponsor_id");

-- CreateIndex
CREATE UNIQUE INDEX "sponsor_receipt_profiles_nit_hash_key" ON "sponsor_receipt_profiles"("nit_hash");

-- CreateIndex
CREATE INDEX "sponsorships_student_id_status_idx" ON "sponsorships"("student_id", "status");

-- CreateIndex
CREATE INDEX "sponsorships_sponsor_id_status_idx" ON "sponsorships"("sponsor_id", "status");

-- CreateIndex
CREATE INDEX "sponsorships_start_date_end_date_idx" ON "sponsorships"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "donation_commitments_sponsorship_id_status_idx" ON "donation_commitments"("sponsorship_id", "status");

-- CreateIndex
CREATE INDEX "donation_commitments_status_start_date_idx" ON "donation_commitments"("status", "start_date");

-- CreateIndex
CREATE INDEX "document_templates_type_is_active_idx" ON "document_templates"("type", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "document_templates_type_version_key" ON "document_templates"("type", "version");

-- CreateIndex
CREATE INDEX "generated_documents_student_id_type_idx" ON "generated_documents"("student_id", "type");

-- CreateIndex
CREATE INDEX "generated_documents_enrollment_id_type_idx" ON "generated_documents"("enrollment_id", "type");

-- CreateIndex
CREATE INDEX "generated_documents_sponsorship_id_type_idx" ON "generated_documents"("sponsorship_id", "type");

-- CreateIndex
CREATE INDEX "generated_documents_generated_at_idx" ON "generated_documents"("generated_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_school_id_status_idx" ON "users"("school_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_refresh_token_hash_key" ON "user_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_expires_at_idx" ON "user_sessions"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_tokens_token_hash_key" ON "user_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "user_tokens_user_id_type_expires_at_idx" ON "user_tokens"("user_id", "type", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_created_at_idx" ON "audit_events"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_user_id_created_at_idx" ON "audit_events"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_school_id_key_key" ON "system_settings"("school_id", "key");

-- AddForeignKey
ALTER TABLE "academic_cycles" ADD CONSTRAINT "academic_cycles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_academic_cycle_id_fkey" FOREIGN KEY ("academic_cycle_id") REFERENCES "academic_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_academic_cycle_id_fkey" FOREIGN KEY ("academic_cycle_id") REFERENCES "academic_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_section_id_fkey" FOREIGN KEY ("class_section_id") REFERENCES "class_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_profiles" ADD CONSTRAINT "household_profiles_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_siblings" ADD CONSTRAINT "student_siblings_household_profile_id_fkey" FOREIGN KEY ("household_profile_id") REFERENCES "household_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_profiles" ADD CONSTRAINT "medical_profiles_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "religious_profiles" ADD CONSTRAINT "religious_profiles_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorized_pickups" ADD CONSTRAINT "authorized_pickups_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_photos" ADD CONSTRAINT "student_photos_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_photos" ADD CONSTRAINT "student_photos_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_receipt_profiles" ADD CONSTRAINT "sponsor_receipt_profiles_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsorships" ADD CONSTRAINT "sponsorships_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsorships" ADD CONSTRAINT "sponsorships_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_commitments" ADD CONSTRAINT "donation_commitments_sponsorship_id_fkey" FOREIGN KEY ("sponsorship_id") REFERENCES "sponsorships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_sponsorship_id_fkey" FOREIGN KEY ("sponsorship_id") REFERENCES "sponsorships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "document_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_generated_by_user_id_fkey" FOREIGN KEY ("generated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PostgreSQL-specific checks and search indexes that Prisma cannot express.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "academic_cycles"
  ADD CONSTRAINT "academic_cycles_valid_dates"
  CHECK ("end_date" > "start_date");

ALTER TABLE "class_sections"
  ADD CONSTRAINT "class_sections_positive_capacity"
  CHECK ("capacity" IS NULL OR "capacity" > 0);

ALTER TABLE "grades"
  ADD CONSTRAINT "grades_valid_age_range"
  CHECK (
    ("min_age" IS NULL OR "min_age" >= 0)
    AND ("max_age" IS NULL OR "max_age" >= 0)
    AND ("min_age" IS NULL OR "max_age" IS NULL OR "max_age" >= "min_age")
  );

ALTER TABLE "student_siblings"
  ADD CONSTRAINT "student_siblings_valid_age"
  CHECK ("age_at_registration" IS NULL OR "age_at_registration" BETWEEN 0 AND 100);

ALTER TABLE "household_profiles"
  ADD CONSTRAINT "household_profiles_valid_size"
  CHECK ("household_size" IS NULL OR "household_size" > 0);

ALTER TABLE "authorized_pickups"
  ADD CONSTRAINT "authorized_pickups_valid_order"
  CHECK ("sort_order" BETWEEN 1 AND 3);

ALTER TABLE "sponsorships"
  ADD CONSTRAINT "sponsorships_valid_dates"
  CHECK ("end_date" IS NULL OR "end_date" >= "start_date");

ALTER TABLE "donation_commitments"
  ADD CONSTRAINT "donation_commitments_positive_amount"
  CHECK ("amount" > 0);

ALTER TABLE "donation_commitments"
  ADD CONSTRAINT "donation_commitments_valid_dates"
  CHECK ("end_date" IS NULL OR "end_date" >= "start_date");

ALTER TABLE "donation_commitments"
  ADD CONSTRAINT "donation_commitments_last_four_digits"
  CHECK ("card_last_four" IS NULL OR "card_last_four" ~ '^[0-9]{4}$');

ALTER TABLE "sponsors"
  ADD CONSTRAINT "sponsors_name_matches_type"
  CHECK (
    ("type" = 'INDIVIDUAL' AND "given_names" IS NOT NULL AND "first_surname" IS NOT NULL)
    OR
    ("type" = 'ORGANIZATION' AND "organization_name" IS NOT NULL)
  );

CREATE UNIQUE INDEX "student_photos_one_active_per_student"
  ON "student_photos" ("student_id")
  WHERE "is_active" = true;

CREATE UNIQUE INDEX "document_templates_one_active_per_type"
  ON "document_templates" ("type")
  WHERE "is_active" = true;

CREATE INDEX "students_search_name_trgm"
  ON "students" USING GIN ("search_name" gin_trgm_ops);

CREATE INDEX "guardians_search_name_trgm"
  ON "guardians" USING GIN ("search_name" gin_trgm_ops);

CREATE INDEX "sponsors_search_name_trgm"
  ON "sponsors" USING GIN ("search_name" gin_trgm_ops);
