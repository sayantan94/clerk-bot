/**
 * TypeScript mirrors of the Python UserProfile Pydantic models.
 *
 * Every field is optional (`?`) to match the Python defaults of `None` and
 * to accommodate partial data returned from the backend.
 */

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
}

export interface PersonalInfo {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  date_of_birth?: string;
  gender?: string;
  nationality?: string;
  marital_status?: string;
  ssn_last_four?: string;
  address?: Address;
}

export interface Education {
  institution?: string;
  degree?: string;
  field_of_study?: string;
  start_date?: string;
  end_date?: string;
  gpa?: string;
}

export interface WorkExperience {
  company?: string;
  title?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
  location?: string;
}

export interface IdentificationDocument {
  document_type?: string;
  document_number?: string;
  issuing_authority?: string;
  issue_date?: string;
  expiry_date?: string;
}

export interface InsuranceInfo {
  provider?: string;
  policy_number?: string;
  group_number?: string;
  member_id?: string;
}

export interface UserProfile {
  personal?: PersonalInfo;
  education?: Education[];
  work_experience?: WorkExperience[];
  skills?: string[];
  identification?: IdentificationDocument[];
  insurance?: InsuranceInfo[];
  additional_data?: Record<string, unknown>;
  parsed_documents?: string[];
  last_updated?: string;
}
