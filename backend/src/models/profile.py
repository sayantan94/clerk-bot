"""Pydantic models for the user profile.

A ``UserProfile`` is the single, comprehensive data object that merges
information extracted from every document the user has uploaded (resume,
passport, insurance card, etc.).  It is persisted as JSON and used as
context when the LLM maps form fields to values.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class Address(BaseModel):
    """Physical / mailing address."""

    street: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    country: str | None = None


class PersonalInfo(BaseModel):
    """Core identity and contact information."""

    first_name: str | None = None
    last_name: str | None = None
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    date_of_birth: str | None = None
    gender: str | None = None
    nationality: str | None = None
    marital_status: str | None = None
    ssn_last_four: str | None = None
    address: Address | None = None


class Education(BaseModel):
    """A single education entry (degree / certification)."""

    institution: str | None = None
    degree: str | None = None
    field_of_study: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    gpa: str | None = None


class WorkExperience(BaseModel):
    """A single work-experience entry."""

    company: str | None = None
    title: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    description: str | None = None
    location: str | None = None


class IdentificationDocument(BaseModel):
    """An identity document (passport, driver license, etc.)."""

    document_type: str | None = None  # passport, driver_license, etc.
    document_number: str | None = None
    issuing_authority: str | None = None
    issue_date: str | None = None
    expiry_date: str | None = None


class InsuranceInfo(BaseModel):
    """Health / auto / other insurance details."""

    provider: str | None = None
    policy_number: str | None = None
    group_number: str | None = None
    member_id: str | None = None


class UserProfile(BaseModel):
    """Comprehensive user profile aggregated from all parsed documents."""

    personal: PersonalInfo = PersonalInfo()
    education: list[Education] = []
    work_experience: list[WorkExperience] = []
    skills: list[str] = []
    identification: list[IdentificationDocument] = []
    insurance: list[InsuranceInfo] = []
    additional_data: dict[str, Any] = {}
    parsed_documents: list[str] = []  # filenames that contributed to this profile
    last_updated: str | None = None
