// backend/verification-service/models/index.js
const { Sequelize, DataTypes } = require('sequelize');

// Initialize Sequelize with PostgreSQL
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  dialectOptions: {
    ssl: process.env.NODE_ENV === 'production' ? {
      require: true,
      rejectUnauthorized: false
    } : false
  },
});

// Define VerificationRequest model
const VerificationRequest = sequelize.define('VerificationRequest', {
  userId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  did: {
    type: DataTypes.STRING,
    allowNull: false
  },
  blockchains: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: false,
    defaultValue: []
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending'
  },
  verificationType: {
    type: DataTypes.ENUM('kyc', 'kyb'),
    allowNull: false
  },
  verifiableCredential: {
    type: DataTypes.TEXT,
    defaultValue: ''
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
});

// Export models
const db = {
  sequelize,
  Sequelize,
  VerificationRequest
};

module.exports = db;