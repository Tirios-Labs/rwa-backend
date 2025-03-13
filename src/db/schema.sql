-- Create tables if they don't exist
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS identities (
    id SERIAL PRIMARY KEY,
    did VARCHAR(255) NOT NULL UNIQUE,
    address VARCHAR(255) NOT NULL,
    token_id VARCHAR(100),
    verifiable_credential JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chain_identities (
    id SERIAL PRIMARY KEY,
    identity_id INTEGER REFERENCES identities(id) ON DELETE CASCADE,
    chain_id VARCHAR(50) NOT NULL,
    chain_address VARCHAR(255) NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP,
    verified_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(identity_id, chain_id)
);

CREATE TABLE IF NOT EXISTS verification_requests (
    id SERIAL PRIMARY KEY,
    request_id VARCHAR(100) NOT NULL UNIQUE,
    did VARCHAR(255) NOT NULL,
    source_chain VARCHAR(50) NOT NULL,
    target_chain VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    transaction_hash VARCHAR(255),
    message JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bridge_messages (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR(100) NOT NULL UNIQUE,
    source_chain VARCHAR(50) NOT NULL,
    target_chain VARCHAR(50) NOT NULL,
    message_data TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create default admin user (password: admin123)
INSERT INTO users (username, email, password, role)
VALUES ('admin', 'admin@example.com', '$2b$10$XK.wHSE8TNk.XnCbEJOEOeK/IJ0BOv5GcP9RTMV7yJkFmQLYqtxI6', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Create default verifier user (password: verifier123)
INSERT INTO users (username, email, password, role)
VALUES ('verifier', 'verifier@example.com', '$2b$10$XK.wHSE8TNk.XnCbEJOEOeK/IJ0BOv5GcP9RTMV7yJkFmQLYqtxI6', 'verifier')
ON CONFLICT (username) DO NOTHING;