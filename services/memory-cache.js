class MemoryCacheService {
    constructor() {
      this.cache = new Map();
      this.expiries = new Map();
      this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
      console.log('Memory cache initialized');
    }
    
    async get(key) {
      if (this.cache.has(key)) {
        const expiry = this.expiries.get(key);
        if (expiry && expiry < Date.now()) {
          this.cache.delete(key);
          this.expiries.delete(key);
          return null;
        }
        return this.cache.get(key);
      }
      return null;
    }
    
    async set(key, value, expiry) {
      let ttl = null;
      if (typeof expiry === 'number') {
        ttl = expiry * 1000;
      }
      
      this.cache.set(key, value);
      if (ttl) {
        this.expiries.set(key, Date.now() + ttl);
      }
      return 'OK';
    }
    
    async del(key) {
      const deleted = this.cache.delete(key);
      this.expiries.delete(key);
      return deleted ? 1 : 0;
    }
    
    cleanup() {
      const now = Date.now();
      for (const [key, expiry] of this.expiries.entries()) {
        if (expiry < now) {
          this.cache.delete(key);
          this.expiries.delete(key);
        }
      }
    }
  }
  
  module.exports = new MemoryCacheService();