// app.js
const auth = require('./utils/auth.js');
const storage = require('./utils/storage.js');
const api = require('./utils/api.js');

App({
  /**
   * Global data
   */
  globalData: {
    userInfo: null,
    isLoggedIn: false,
    appId: 'your-wechat-appid', // Replace with your actual WeChat Mini-Program AppID
    version: '1.0.0',
    needsLogin: false,
    systemInfo: null
  },

  /**
   * Application launch
   */
  onLaunch: function (options) {
    console.log('StorySpark App Launched', options);
    
    // Initialize app
    this.initializeApp();
    
    // Setup system info
    this.setupSystemInfo();
    
    // Setup API configuration
    this.setupAPI();
    
    // Perform auto-login
    this.performAutoLogin();
    
    // Setup storage cleanup
    this.setupStorageCleanup();
  },

  /**
   * Application show (when app becomes active)
   */
  onShow: function (options) {
    console.log('StorySpark App Shown', options);
    
    // Check authentication status
    this.checkAuthenticationStatus();
    
    // Handle app launch scenarios
    this.handleAppLaunchScenario(options);
  },

  /**
   * Application hide (when app becomes inactive)
   */
  onHide: function () {
    console.log('StorySpark App Hidden');
    
    // Save current state
    this.saveAppState();
  },

  /**
   * Application error handler
   */
  onError: function (error) {
    console.error('StorySpark App Error:', error);
    
    // Log error for debugging
    this.logError(error);
    
    // Handle critical errors
    this.handleCriticalError(error);
  },

  /**
   * Page not found handler
   */
  onPageNotFound: function (res) {
    console.warn('Page Not Found:', res);
    
    // Redirect to index page
    wx.reLaunch({
      url: '/pages/index/index'
    });
  },

  /**
   * Initialize application
   */
  initializeApp: function () {
    console.log('Initializing StorySpark App...');
    
    // Check app version and handle updates
    this.checkAppVersion();
    
    // Initialize global state
    this.globalData.userInfo = auth.getUserInfo();
    this.globalData.isLoggedIn = auth.isAuthenticated();
    
    console.log('App initialized successfully');
  },

  /**
   * Setup system information
   */
  setupSystemInfo: function () {
    try {
      const systemInfo = wx.getSystemInfoSync();
      this.globalData.systemInfo = systemInfo;
      
      console.log('System Info:', systemInfo);
      
      // Adjust UI for different devices
      this.adjustUIForDevice(systemInfo);
      
    } catch (error) {
      console.error('Failed to get system info:', error);
    }
  },

  /**
   * Setup API configuration
   */
  setupAPI: function () {
    // Set API base URL based on environment
    const isDev = wx.getAccountInfoSync().miniProgram.envVersion === 'develop';
    const baseURL = isDev 
      ? 'https://dev-api.storyspark.com/api'  // Development API
      : 'https://api.storyspark.com/api';     // Production API
    
    api.setBaseURL(baseURL);
    
    console.log(`API configured for ${isDev ? 'development' : 'production'}: ${baseURL}`);
  },

  /**
   * Perform auto-login on app start
   */
  async performAutoLogin() {
    console.log('Starting auto-login...');
    
    try {
      // Check if we have stored authentication
      if (!auth.isAuthenticated()) {
        console.log('No valid authentication found');
        return;
      }

      // Check if token needs refresh
      if (auth.needsTokenRefresh()) {
        console.log('Token needs refresh, attempting auto-refresh...');
        
        const refreshSuccess = await auth.autoRefreshToken();
        if (!refreshSuccess) {
          console.log('Token refresh failed, user needs to login again');
          this.handleAutoLoginFailure();
          return;
        }
        
        console.log('Token refreshed successfully');
      }

      // Update global state
      this.globalData.userInfo = auth.getUserInfo();
      this.globalData.isLoggedIn = true;
      
      console.log('Auto-login successful');
      
      // Notify pages about login status
      this.notifyPagesAboutAuth(true);
      
    } catch (error) {
      console.error('Auto-login failed:', error);
      this.handleAutoLoginFailure();
    }
  },

  /**
   * Handle auto-login failure
   */
  handleAutoLoginFailure: function () {
    console.log('Handling auto-login failure...');
    
    // Clear potentially corrupted auth data
    auth.logout().catch((error) => {
      console.error('Failed to clear auth data:', error);
    });
    
    // Update global state
    this.globalData.userInfo = null;
    this.globalData.isLoggedIn = false;
    this.globalData.needsLogin = true;
    
    // Notify pages about logout
    this.notifyPagesAboutAuth(false);
  },

  /**
   * Check authentication status
   */
  checkAuthenticationStatus: function () {
    const isCurrentlyLoggedIn = auth.isAuthenticated();
    
    if (this.globalData.isLoggedIn !== isCurrentlyLoggedIn) {
      this.globalData.isLoggedIn = isCurrentlyLoggedIn;
      this.globalData.userInfo = isCurrentlyLoggedIn ? auth.getUserInfo() : null;
      
      console.log(`Authentication status changed: ${isCurrentlyLoggedIn ? 'logged in' : 'logged out'}`);
      
      // Notify pages about auth status change
      this.notifyPagesAboutAuth(isCurrentlyLoggedIn);
    }
  },

  /**
   * Handle app launch scenarios
   */
  handleAppLaunchScenario: function (options) {
    const { scene, query, referrerInfo } = options;
    
    console.log(`App launch scenario: ${scene}`, { query, referrerInfo });
    
    // Handle different launch scenarios
    switch (scene) {
      case 1001: // Discovery section (Favorites)
      case 1005: // Top left corner menu
      case 1006: // QR code
        // Normal launch, no special handling needed
        break;
        
      case 1007: // Single message sharing
      case 1008: // Group message sharing
        this.handleSharedLaunch(query);
        break;
        
      case 1011: // QR code
        this.handleQRCodeLaunch(query);
        break;
        
      default:
        // Other scenarios
        console.log(`Unhandled launch scenario: ${scene}`);
    }
  },

  /**
   * Handle shared launch
   */
  handleSharedLaunch: function (query) {
    console.log('App launched from sharing:', query);
    
    // Store shared data for processing after login
    if (query) {
      storage.set('shared_launch_data', {
        query: query,
        timestamp: Date.now()
      });
    }
  },

  /**
   * Handle QR code launch
   */
  handleQRCodeLaunch: function (query) {
    console.log('App launched from QR code:', query);
    
    // Store QR data for processing after login
    if (query) {
      storage.set('qr_launch_data', {
        query: query,
        timestamp: Date.now()
      });
    }
  },

  /**
   * Setup storage cleanup
   */
  setupStorageCleanup: function () {
    // Clean up expired storage entries
    try {
      const cleanedCount = storage.cleanupExpired();
      console.log(`Cleaned up ${cleanedCount} expired storage entries`);
    } catch (error) {
      console.error('Storage cleanup failed:', error);
    }
    
    // Perform storage migration if needed
    try {
      storage.migrate();
    } catch (error) {
      console.error('Storage migration failed:', error);
    }
  },

  /**
   * Check app version and handle updates
   */
  checkAppVersion: function () {
    const updateManager = wx.getUpdateManager();
    
    if (!updateManager) {
      return;
    }

    updateManager.onCheckForUpdate((res) => {
      console.log('Update check result:', res.hasUpdate);
    });

    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: '更新提示',
        content: '新版本已经准备好，是否重启应用？',
        success: (res) => {
          if (res.confirm) {
            updateManager.applyUpdate();
          }
        }
      });
    });

    updateManager.onUpdateFailed(() => {
      console.error('App update failed');
    });
  },

  /**
   * Adjust UI for different devices
   */
  adjustUIForDevice: function (systemInfo) {
    const { model, pixelRatio, screenWidth, screenHeight, statusBarHeight } = systemInfo;
    
    // Store device-specific CSS variables
    const cssVariables = {
      '--status-bar-height': `${statusBarHeight}px`,
      '--screen-width': `${screenWidth}px`,
      '--screen-height': `${screenHeight}px`,
      '--pixel-ratio': pixelRatio
    };
    
    // Apply CSS variables (if supported)
    this.globalData.cssVariables = cssVariables;
    
    console.log('UI adjusted for device:', model);
  },

  /**
   * Notify pages about authentication changes
   */
  notifyPagesAboutAuth: function (isLoggedIn) {
    // Get current pages stack
    const pages = getCurrentPages();
    
    pages.forEach((page, index) => {
      if (page.onAuthStatusChange && typeof page.onAuthStatusChange === 'function') {
        try {
          page.onAuthStatusChange(isLoggedIn, this.globalData.userInfo);
        } catch (error) {
          console.error(`Failed to notify page ${index} about auth change:`, error);
        }
      }
    });
  },

  /**
   * Save app state
   */
  saveAppState: function () {
    try {
      const appState = {
        lastActiveTime: Date.now(),
        userInfo: this.globalData.userInfo,
        isLoggedIn: this.globalData.isLoggedIn
      };
      
      storage.set('app_state', appState);
    } catch (error) {
      console.error('Failed to save app state:', error);
    }
  },

  /**
   * Log error for debugging
   */
  logError: function (error) {
    const errorData = {
      message: error.message || 'Unknown error',
      stack: error.stack,
      timestamp: Date.now(),
      userInfo: this.globalData.userInfo,
      systemInfo: this.globalData.systemInfo
    };
    
    // Store error log locally for debugging
    try {
      const errorLogs = storage.get('error_logs', []);
      errorLogs.push(errorData);
      
      // Keep only last 50 errors
      if (errorLogs.length > 50) {
        errorLogs.splice(0, errorLogs.length - 50);
      }
      
      storage.set('error_logs', errorLogs);
    } catch (storageError) {
      console.error('Failed to log error:', storageError);
    }
  },

  /**
   * Handle critical errors
   */
  handleCriticalError: function (error) {
    // For critical errors, show user-friendly message
    wx.showModal({
      title: '应用异常',
      content: '应用遇到问题，请重启后再试',
      showCancel: false,
      confirmText: '重启应用',
      success: () => {
        wx.reLaunch({
          url: '/pages/index/index'
        });
      }
    });
  },

  /**
   * User login callback
   */
  onUserLogin: function (userInfo) {
    console.log('User logged in:', userInfo);
    
    this.globalData.userInfo = userInfo;
    this.globalData.isLoggedIn = true;
    this.globalData.needsLogin = false;
    
    // Process any pending launch data
    this.processPendingLaunchData();
    
    // Notify pages
    this.notifyPagesAboutAuth(true);
  },

  /**
   * User logout callback
   */
  onUserLogout: function () {
    console.log('User logged out');
    
    this.globalData.userInfo = null;
    this.globalData.isLoggedIn = false;
    
    // Notify pages
    this.notifyPagesAboutAuth(false);
  },

  /**
   * Process pending launch data after login
   */
  processPendingLaunchData: function () {
    // Process shared launch data
    const sharedData = storage.get('shared_launch_data');
    if (sharedData) {
      console.log('Processing shared launch data:', sharedData);
      storage.remove('shared_launch_data');
      // Handle shared content here
    }
    
    // Process QR launch data
    const qrData = storage.get('qr_launch_data');
    if (qrData) {
      console.log('Processing QR launch data:', qrData);
      storage.remove('qr_launch_data');
      // Handle QR content here
    }
  }
});