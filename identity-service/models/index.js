// backend/identity-service/models/index.js
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

// Define User model
const User = sequelize.define('User', {
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  ethereumAddress: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true
  },
  solanaAddress: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true
  },
  polygonAddress: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true
  },
  did: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true
  },
  soulboundTokenId: {
    type: DataTypes.INTEGER,
    unique: true,
    allowNull: true
  },
  verificationStatus: {
    type: DataTypes.ENUM('unverified', 'pending', 'verified'),
    defaultValue: 'unverified'
  }
});

// Export models
const db = {
  sequelize,
  Sequelize,
  User
};

module.exports = db;