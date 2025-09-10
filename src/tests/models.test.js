const User = require('../models/User');
const Device = require('../models/Device');
const dbConnection = require('../config/database');
const { randomUUID } = require('crypto');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'storyspark_test';

describe('Database Models Tests', () => {
  let testUser;
  let testDevice;
  let testPool;

  beforeAll(async () => {
    // Get test database connection
    testPool = dbConnection.getTestPool();
    
    // Test database connection
    const connectionTest = await dbConnection.testConnection('test');
    if (!connectionTest.success) {
      console.error('Test database connection failed:', connectionTest.error);
      throw new Error('Cannot connect to test database');
    }
    
    console.log('✅ Test database connected:', connectionTest.timestamp);

    // Clean up any existing test data
    await cleanupTestData();

    // Run migrations if needed (create tables)
    await createTestTables();
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestData();
    
    // Close test database connection
    await dbConnection.close('test');
  });

  beforeEach(async () => {
    // Clean up before each test
    await cleanupTestData();
  });

  afterEach(async () => {
    // Clean up after each test
    await cleanupTestData();
  });

  async function cleanupTestData() {
    try {
      await dbConnection.query('DELETE FROM devices', [], 'test');
      await dbConnection.query('DELETE FROM users', [], 'test');
    } catch (error) {
      console.log('Cleanup note: tables may not exist yet:', error.message);
    }
  }

  async function createTestTables() {
    try {
      // Create users table
      await dbConnection.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          wechat_openid VARCHAR(255) NOT NULL UNIQUE,
          nickname VARCHAR(255),
          avatar_url TEXT,
          last_login TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `, [], 'test');

      // Create devices table
      await dbConnection.query(`
        CREATE TABLE IF NOT EXISTS devices (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          device_name VARCHAR(255) NOT NULL,
          device_type VARCHAR(100) NOT NULL,
          mac_address VARCHAR(17) UNIQUE,
          pairing_code VARCHAR(20),
          is_paired BOOLEAN DEFAULT FALSE,
          last_seen TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `, [], 'test');

      console.log('✅ Test tables created successfully');
    } catch (error) {
      console.error('Error creating test tables:', error);
      throw error;
    }
  }

  describe('User Model Tests', () => {
    test('User creation with valid data', async () => {
      const userData = {
        wechat_openid: 'test_openid_12345678901234567890',
        nickname: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg'
      };

      testUser = new User(userData);
      expect(testUser.isValid()).toBe(true);
      expect(testUser.get('wechat_openid')).toBe(userData.wechat_openid);
      expect(testUser.get('nickname')).toBe(userData.nickname);
      expect(testUser.get('id')).toBeDefined();
      expect(testUser.get('created_at')).toBeDefined();

      console.log('✅ User validation working:', {
        id: testUser.get('id').substring(0, 8) + '...',
        openid: testUser.get('wechat_openid').substring(0, 12) + '...',
        nickname: testUser.get('nickname')
      });
    });

    test('User validation - missing required fields', () => {
      const invalidUser = new User({
        nickname: 'Test User'
        // Missing wechat_openid
      });

      expect(invalidUser.isValid()).toBe(false);
      const errors = invalidUser.getErrors();
      expect(errors.wechat_openid).toContain('wechat_openid is required');

      console.log('✅ User required field validation working');
    });

    test('User validation - invalid WeChat OpenID format', () => {
      const invalidUser = new User({
        wechat_openid: 'invalid',
        nickname: 'Test User'
      });

      expect(invalidUser.isValid()).toBe(false);
      const errors = invalidUser.getErrors();
      expect(errors.wechat_openid).toBeDefined();

      console.log('✅ User OpenID format validation working');
    });

    test('User database operations - save and find', async () => {
      const userData = {
        wechat_openid: 'test_openid_save_12345678901234567890',
        nickname: 'Save Test User',
        avatar_url: 'https://example.com/save-avatar.jpg'
      };

      // Create and save user
      testUser = new User(userData);
      await testUser.save();
      
      expect(testUser.get('id')).toBeDefined();
      expect(typeof testUser.get('created_at')).toBe('string');

      // Find user by ID
      const foundUser = await User.findById(testUser.get('id'));
      expect(foundUser).not.toBeNull();
      expect(foundUser.get('wechat_openid')).toBe(userData.wechat_openid);
      expect(foundUser.get('nickname')).toBe(userData.nickname);

      // Find user by WeChat OpenID
      const foundByOpenId = await User.findByWechatId(userData.wechat_openid);
      expect(foundByOpenId).not.toBeNull();
      expect(foundByOpenId.get('id')).toBe(testUser.get('id'));

      console.log('✅ User database save and find operations working:', {
        id: foundUser.get('id').substring(0, 8) + '...',
        openid: foundUser.get('wechat_openid').substring(0, 12) + '...'
      });
    });

    test('User profile methods', async () => {
      const userData = {
        wechat_openid: 'test_profile_12345678901234567890',
        nickname: 'Profile Test User',
        avatar_url: 'https://example.com/profile-avatar.jpg'
      };

      testUser = new User(userData);
      await testUser.save();

      const profile = testUser.getProfile();
      expect(profile).toHaveProperty('id');
      expect(profile).toHaveProperty('nickname');
      expect(profile).toHaveProperty('avatar_url');
      expect(profile).not.toHaveProperty('wechat_openid'); // Should be excluded from profile

      console.log('✅ User profile method working:', profile);
    });

    test('User login tracking', async () => {
      const userData = {
        wechat_openid: 'test_login_12345678901234567890',
        nickname: 'Login Test User'
      };

      testUser = new User(userData);
      await testUser.save();

      // Update last login
      await testUser.updateLastLogin();
      
      // Verify last login was updated
      const updatedUser = await User.findById(testUser.get('id'));
      expect(updatedUser.get('last_login')).toBeDefined();
      expect(new Date(updatedUser.get('last_login'))).toBeInstanceOf(Date);

      console.log('✅ User login tracking working');
    });

    test('User findOrCreateByWechat method', async () => {
      const wechatData = {
        openid: 'test_find_or_create_12345678901234567890',
        nickname: 'Find Or Create User',
        avatar_url: 'https://example.com/find-create-avatar.jpg'
      };

      // First call should create
      const user1 = await User.findOrCreateByWechat(wechatData);
      expect(user1).toBeInstanceOf(User);
      expect(user1.get('wechat_openid')).toBe(wechatData.openid);

      // Second call should find existing
      const user2 = await User.findOrCreateByWechat(wechatData);
      expect(user2.get('id')).toBe(user1.get('id'));

      console.log('✅ User findOrCreateByWechat working:', {
        id: user1.get('id').substring(0, 8) + '...',
        openid: user1.get('wechat_openid').substring(0, 12) + '...'
      });
    });
  });

  describe('Device Model Tests', () => {
    beforeEach(async () => {
      // Create a test user for device tests
      testUser = new User({
        wechat_openid: 'test_device_user_12345678901234567890',
        nickname: 'Device Test User'
      });
      await testUser.save();
    });

    test('Device creation with valid data', async () => {
      const deviceData = {
        user_id: testUser.get('id'),
        device_name: 'Test Story Speaker',
        device_type: 'speaker',
        mac_address: '00:11:22:33:44:55'
      };

      testDevice = new Device(deviceData);
      expect(testDevice.isValid()).toBe(true);
      expect(testDevice.get('user_id')).toBe(deviceData.user_id);
      expect(testDevice.get('device_name')).toBe(deviceData.device_name);
      expect(testDevice.get('is_paired')).toBe(false); // Default value

      console.log('✅ Device validation working:', {
        id: testDevice.get('id').substring(0, 8) + '...',
        name: testDevice.get('device_name'),
        type: testDevice.get('device_type')
      });
    });

    test('Device validation - missing required fields', () => {
      const invalidDevice = new Device({
        device_name: 'Test Device'
        // Missing user_id and device_type
      });

      expect(invalidDevice.isValid()).toBe(false);
      const errors = invalidDevice.getErrors();
      expect(errors.user_id).toBeDefined();
      expect(errors.device_type).toBeDefined();

      console.log('✅ Device required field validation working');
    });

    test('Device MAC address validation', () => {
      const invalidDevice = new Device({
        user_id: testUser.get('id'),
        device_name: 'Test Device',
        device_type: 'speaker',
        mac_address: 'invalid_mac'
      });

      expect(invalidDevice.isValid()).toBe(false);
      const errors = invalidDevice.getErrors();
      expect(errors.mac_address).toBeDefined();

      console.log('✅ Device MAC address validation working');
    });

    test('Device database operations - save and find', async () => {
      const deviceData = {
        user_id: testUser.get('id'),
        device_name: 'Test Save Speaker',
        device_type: 'speaker',
        mac_address: '00:11:22:33:44:66'
      };

      // Create and save device
      testDevice = new Device(deviceData);
      await testDevice.save();
      
      expect(testDevice.get('id')).toBeDefined();
      expect(testDevice.get('created_at')).toBeDefined();

      // Find device by ID
      const foundDevice = await Device.findById(testDevice.get('id'));
      expect(foundDevice).not.toBeNull();
      expect(foundDevice.get('device_name')).toBe(deviceData.device_name);
      expect(foundDevice.get('user_id')).toBe(deviceData.user_id);

      console.log('✅ Device database save and find operations working:', {
        id: foundDevice.get('id').substring(0, 8) + '...',
        name: foundDevice.get('device_name')
      });
    });

    test('Device user association', async () => {
      const deviceData = {
        user_id: testUser.get('id'),
        device_name: 'Association Test Speaker',
        device_type: 'speaker',
        mac_address: '00:11:22:33:44:77'
      };

      testDevice = new Device(deviceData);
      await testDevice.save();

      // Get associated user
      const associatedUser = await testDevice.getUser();
      expect(associatedUser).not.toBeNull();
      expect(associatedUser.get('id')).toBe(testUser.get('id'));
      expect(associatedUser.get('wechat_openid')).toBe(testUser.get('wechat_openid'));

      console.log('✅ Device user association working:', {
        deviceId: testDevice.get('id').substring(0, 8) + '...',
        userId: associatedUser.get('id').substring(0, 8) + '...'
      });
    });

    test('Device pairing methods', async () => {
      const deviceData = {
        user_id: testUser.get('id'),
        device_name: 'Pairing Test Speaker',
        device_type: 'speaker',
        mac_address: '00:11:22:33:44:88'
      };

      testDevice = new Device(deviceData);
      await testDevice.save();

      // Generate pairing code
      testDevice.generatePairingCode();
      expect(testDevice.get('pairing_code')).toBeDefined();
      expect(testDevice.get('pairing_code')).toMatch(/^[A-Z0-9]{6}$/);

      // Mark as paired
      await testDevice.markAsPaired();
      expect(testDevice.get('is_paired')).toBe(true);

      console.log('✅ Device pairing methods working:', {
        pairingCode: testDevice.get('pairing_code'),
        isPaired: testDevice.get('is_paired')
      });
    });

    test('Find devices by user', async () => {
      // Create multiple devices for the user
      const device1 = new Device({
        user_id: testUser.get('id'),
        device_name: 'User Device 1',
        device_type: 'speaker',
        mac_address: '00:11:22:33:44:99'
      });
      await device1.save();

      const device2 = new Device({
        user_id: testUser.get('id'),
        device_name: 'User Device 2',
        device_type: 'speaker',
        mac_address: '00:11:22:33:44:AA'
      });
      await device2.save();

      // Find devices by user
      const userDevices = await Device.findByUser(testUser.get('id'));
      expect(userDevices).toHaveLength(2);
      expect(userDevices[0]).toBeInstanceOf(Device);
      expect(userDevices[1]).toBeInstanceOf(Device);

      console.log('✅ Find devices by user working:', {
        userId: testUser.get('id').substring(0, 8) + '...',
        deviceCount: userDevices.length
      });
    });
  });

  describe('Model Relationship Tests', () => {
    beforeEach(async () => {
      // Create test user
      testUser = new User({
        wechat_openid: 'test_relationship_user_12345678901234567890',
        nickname: 'Relationship Test User'
      });
      await testUser.save();
    });

    test('User has many devices association', async () => {
      // Create devices for the user
      const device1 = new Device({
        user_id: testUser.get('id'),
        device_name: 'Relationship Device 1',
        device_type: 'speaker',
        mac_address: '00:11:22:33:44:BB'
      });
      await device1.save();

      const device2 = new Device({
        user_id: testUser.get('id'),
        device_name: 'Relationship Device 2',
        device_type: 'speaker',
        mac_address: '00:11:22:33:44:CC'
      });
      await device2.save();

      // Test the association
      const userDevices = await testUser.getDevices();
      expect(userDevices).toHaveLength(2);
      expect(userDevices.every(device => device instanceof Device)).toBe(true);

      console.log('✅ User has many devices association working:', {
        userId: testUser.get('id').substring(0, 8) + '...',
        deviceCount: userDevices.length
      });
    });

    test('Device belongs to user association', async () => {
      testDevice = new Device({
        user_id: testUser.get('id'),
        device_name: 'Belongs To Test Device',
        device_type: 'speaker',
        mac_address: '00:11:22:33:44:DD'
      });
      await testDevice.save();

      const deviceOwner = await testDevice.getUser();
      expect(deviceOwner).toBeInstanceOf(User);
      expect(deviceOwner.get('id')).toBe(testUser.get('id'));

      console.log('✅ Device belongs to user association working');
    });
  });

  describe('Data Sanitization Tests', () => {
    test('XSS prevention in user data', async () => {
      const maliciousData = {
        wechat_openid: 'test_xss_12345678901234567890',
        nickname: '<script>alert("xss")</script>',
        avatar_url: 'javascript:alert("xss")'
      };

      const user = new User(maliciousData);
      user.sanitize();

      expect(user.get('nickname')).not.toContain('<script>');
      expect(user.get('nickname')).toContain('&lt;script&gt;');
      
      console.log('✅ XSS prevention working:', {
        original: maliciousData.nickname,
        sanitized: user.get('nickname')
      });
    });

    test('Data trimming and cleaning', async () => {
      const dirtyData = {
        wechat_openid: 'test_trim_12345678901234567890',
        nickname: '  Dirty User  ',
        device_name: '  Device with spaces  '
      };

      const user = new User(dirtyData);
      user.sanitize();

      expect(user.get('nickname')).toBe('Dirty User');
      
      const device = new Device({ ...dirtyData, user_id: randomUUID(), device_type: 'speaker' });
      device.sanitize();
      
      expect(device.get('device_name')).toBe('Device with spaces');

      console.log('✅ Data trimming working');
    });
  });
});

console.log('\n🧪 Database Models Test Suite');
console.log('=============================');
console.log('This comprehensive test suite validates:');
console.log('• User and Device model validation');
console.log('• Database CRUD operations');
console.log('• Model associations and relationships');
console.log('• Data sanitization and security');
console.log('• WeChat-specific functionality');
console.log('=============================\n');