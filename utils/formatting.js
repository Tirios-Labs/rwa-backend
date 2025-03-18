/**
 * Utility functions for data formatting and normalization
 */

/**
 * Normalize an Ethereum address
 * @param {String} address - Ethereum address
 * @returns {String} - Normalized address (lowercase)
 */
const normalizeEthAddress = (address) => {
    if (!address || typeof address !== 'string') {
      return null;
    }
    
    // Remove whitespace and convert to lowercase
    return address.trim().toLowerCase();
  };
  
  /**
   * Format a date as ISO string or custom format
   * @param {Date|String|Number} date - Date to format
   * @param {String} format - Optional format (default: 'iso')
   * @returns {String} - Formatted date
   */
  const formatDate = (date, format = 'iso') => {
    if (!date) {
      return null;
    }
    
    const dateObj = date instanceof Date ? date : new Date(date);
    
    if (isNaN(dateObj.getTime())) {
      return null;
    }
    
    if (format === 'iso') {
      return dateObj.toISOString();
    }
    
    // Custom formats
    if (format === 'date-only') {
      return dateObj.toISOString().split('T')[0];
    }
    
    if (format === 'time-only') {
      return dateObj.toISOString().split('T')[1].split('.')[0];
    }
    
    if (format === 'human') {
      return dateObj.toLocaleString();
    }
    
    return dateObj.toISOString();
  };
  
  /**
   * Parse and normalize a JSON object
   * @param {String|Object} json - JSON string or object
   * @returns {Object} - Parsed and normalized object
   */
  const parseJSON = (json) => {
    if (!json) {
      return null;
    }
    
    try {
      if (typeof json === 'string') {
        return JSON.parse(json);
      }
      
      if (typeof json === 'object') {
        return json;
      }
      
      return null;
    } catch (error) {
      console.error('Error parsing JSON:', error);
      return null;
    }
  };
  
  /**
   * Stringify an object with whitespace for readability
   * @param {Object} obj - Object to stringify
   * @param {Number} spaces - Number of spaces for indentation
   * @returns {String} - Formatted JSON string
   */
  const formatJSON = (obj, spaces = 2) => {
    if (!obj) {
      return '';
    }
    
    try {
      return JSON.stringify(obj, null, spaces);
    } catch (error) {
      console.error('Error formatting JSON:', error);
      return '';
    }
  };
  
  /**
   * Truncate a string to a maximum length
   * @param {String} str - String to truncate
   * @param {Number} maxLength - Maximum length
   * @param {String} suffix - Suffix to add when truncated (default: '...')
   * @returns {String} - Truncated string
   */
  const truncateString = (str, maxLength = 100, suffix = '...') => {
    if (!str || typeof str !== 'string') {
      return '';
    }
    
    if (str.length <= maxLength) {
      return str;
    }
    
    return str.slice(0, maxLength) + suffix;
  };
  
  /**
   * Format a file size in human-readable form
   * @param {Number} bytes - Size in bytes
   * @param {Number} decimals - Decimal places (default: 2)
   * @returns {String} - Formatted size (e.g. "2.5 MB")
   */
  const formatFileSize = (bytes, decimals = 2) => {
    if (!bytes || isNaN(bytes)) {
      return '0 Bytes';
    }
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
  };
  
  /**
   * Format a number with commas as thousands separators
   * @param {Number} number - Number to format
   * @param {Number} decimals - Decimal places (default: 0)
   * @returns {String} - Formatted number
   */
  const formatNumber = (number, decimals = 0) => {
    if (number === null || number === undefined || isNaN(number)) {
      return '0';
    }
    
    return Number(number).toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  };
  
  /**
   * Normalize a DID string
   * @param {String} did - DID to normalize
   * @returns {String} - Normalized DID
   */
  const normalizeDID = (did) => {
    if (!did || typeof did !== 'string') {
      return null;
    }
    
    // Remove whitespace
    return did.trim();
  };
  
  /**
   * Convert an object to query string
   * @param {Object} params - Query parameters
   * @returns {String} - Query string (without leading ?)
   */
  const toQueryString = (params) => {
    if (!params || typeof params !== 'object') {
      return '';
    }
    
    return Object.entries(params)
      .filter(([_, value]) => value !== null && value !== undefined)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  };
  
  /**
   * Extract domain from URL
   * @param {String} url - URL to parse
   * @returns {String} - Domain name
   */
  const extractDomain = (url) => {
    if (!url || typeof url !== 'string') {
      return null;
    }
    
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return urlObj.hostname;
    } catch (error) {
      console.error('Error extracting domain:', error);
      return null;
    }
  };
  
  /**
   * Sanitize a string for safe display
   * @param {String} str - String to sanitize
   * @returns {String} - Sanitized string
   */
  const sanitizeString = (str) => {
    if (!str || typeof str !== 'string') {
      return '';
    }
    
    // Basic sanitization - replace HTML tags and special characters
    return str
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };
  
  module.exports = {
    normalizeEthAddress,
    formatDate,
    parseJSON,
    formatJSON,
    truncateString,
    formatFileSize,
    formatNumber,
    normalizeDID,
    toQueryString,
    extractDomain,
    sanitizeString
  };