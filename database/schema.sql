-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address VARCHAR(255) NOT NULL UNIQUE,
    did VARCHAR(255) UNIQUE,
    nonce VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create DID documents table
CREATE TABLE did_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    did VARCHAR(255) NOT NULL UNIQUE,
    document JSONB NOT NULL,
    ipfs_cid VARCHAR(255),
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create roles table
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_roles table (many-to-many)
CREATE TABLE user_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    chain_id VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id, chain_id)
);

-- Create credentials table
CREATE TABLE credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credential_hash VARCHAR(255) NOT NULL UNIQUE,
    issuer_did VARCHAR(255) NOT NULL,
    subject_did VARCHAR(255) NOT NULL,
    credential_type VARCHAR(255) NOT NULL,
    credential_schema VARCHAR(255),
    issuance_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expiration_date TIMESTAMP WITH TIME ZONE,
    revocation_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    metadata JSONB,
    ipfs_cid VARCHAR(255) NOT NULL,
    proof JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create verification requests table
CREATE TABLE verification_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id BIGINT NOT NULL,
    source_chain VARCHAR(50) NOT NULL,
    target_chain VARCHAR(50) NOT NULL,
    did VARCHAR(255),
    credential_hash VARCHAR(255),
    is_verified BOOLEAN DEFAULT FALSE,
    verification_type VARCHAR(50) NOT NULL,
    message_id VARCHAR(255),
    response_message_id VARCHAR(255),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    verified_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'PENDING'
);

-- Create chain identity mapping table
CREATE TABLE chain_identities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    did VARCHAR(255) NOT NULL,
    chain_id VARCHAR(50) NOT NULL,
    address VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(did, chain_id)
);

-- Create cross-chain messages table
CREATE TABLE cross_chain_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id VARCHAR(255) NOT NULL UNIQUE,
    message_type VARCHAR(50) NOT NULL,
    source_chain VARCHAR(50) NOT NULL,
    target_chain VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'SENT',
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    received_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Create auth sessions table
CREATE TABLE auth_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address VARCHAR(50),
    user_agent TEXT
);

-- Create audit logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    resource_type VARCHAR(255) NOT NULL,
    resource_id VARCHAR(255),
    previous_state JSONB,
    new_state JSONB,
    metadata JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create KYC verification table
CREATE TABLE kyc_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    verification_level VARCHAR(50) NOT NULL,
    provider VARCHAR(100) NOT NULL,
    provider_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'PENDING',
    verification_data JSONB,
    metadata JSONB,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    verified_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE did_to_sbt (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    did VARCHAR(255) NOT NULL UNIQUE,
    sbt_token_id BIGINT NOT NULL,
    chain_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_did FOREIGN KEY(did) REFERENCES did_documents(did)
);

CREATE TABLE zk_proofs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    verification_id UUID REFERENCES kyc_verifications(id) ON DELETE SET NULL,
    proof_type VARCHAR(50) NOT NULL,
    proof_data JSONB NOT NULL,
    public_inputs JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- Add sbt_token_id column to credentials table
ALTER TABLE credentials ADD COLUMN sbt_token_id BIGINT;
CREATE INDEX idx_credentials_sbt_token_id ON credentials(sbt_token_id);
-- Indexes for performance
CREATE INDEX idx_credentials_subject_did ON credentials(subject_did);
CREATE INDEX idx_credentials_issuer_did ON credentials(issuer_did);
CREATE INDEX idx_credentials_status ON credentials(status);
CREATE INDEX idx_verification_requests_status ON verification_requests(status);
CREATE INDEX idx_verification_requests_chains ON verification_requests(source_chain, target_chain);
CREATE INDEX idx_cross_chain_messages_status ON cross_chain_messages(status);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_kyc_verifications_status ON kyc_verifications(status);
CREATE INDEX idx_zk_proofs_user_id ON zk_proofs(user_id);
CREATE INDEX idx_zk_proofs_type ON zk_proofs(proof_type);