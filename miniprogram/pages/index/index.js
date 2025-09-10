// pages/index/index.js
const auth = require('../../utils/auth.js');
const storage = require('../../utils/storage.js');

Page({
  data: {
    // Authentication state
    isLoggedIn: false,
    loading: false,
    loadingText: '正在登录...',
    errorMessage: '',
    
    // User information
    userInfo: null,
    
    // UI state
    showUserProfile: false
  },

  onLoad: function (options) {
    console.log('Index page loaded');
    
    // Initialize page state
    this.initPageState();
    
    // Check if user is already logged in
    this.checkLoginStatus();
  },

  onShow: function () {
    console.log('Index page shown');
    
    // Check if we need to handle login state changes
    const app = getApp();
    if (app.globalData.needsLogin) {
      app.globalData.needsLogin = false;
      this.handleLogout();
    }
    
    // Refresh user info if logged in
    if (this.data.isLoggedIn) {
      this.refreshUserInfo();
    }
  },

  /**
   * Initialize page state
   */
  initPageState: function() {
    this.setData({
      isLoggedIn: false,
      loading: false,
      loadingText: '正在登录...',
      errorMessage: '',
      userInfo: null,
      showUserProfile: false
    });
  },

  /**
   * Check current login status
   */
  checkLoginStatus: function() {
    const isAuthenticated = auth.isAuthenticated();
    const userInfo = auth.getUserInfo();
    
    if (isAuthenticated && userInfo) {
      this.setData({
        isLoggedIn: true,
        userInfo: userInfo,
        errorMessage: ''
      });
    } else {
      this.setData({
        isLoggedIn: false,
        userInfo: null
      });
    }
  },

  /**
   * Handle WeChat login button tap
   */
  handleWeChatLogin: function() {
    if (this.data.loading) {
      return; // Prevent multiple simultaneous login attempts
    }

    this.setData({
      loading: true,
      errorMessage: '',
      loadingText: '正在获取授权码...'
    });

    // Start WeChat OAuth flow
    auth.login({
      onProgress: (state, message) => {
        this.setData({
          loadingText: message
        });
      }
    }).then((result) => {
      console.log('Login successful:', result);
      
      // Check if we need to get additional user profile
      this.handleLoginSuccess(result);
      
    }).catch((error) => {
      console.error('Login failed:', error);
      this.handleLoginError(error);
    });
  },

  /**
   * Handle successful login
   * @param {Object} result - Login result
   */
  handleLoginSuccess: function(result) {
    const { user } = result;
    
    // Check if we have complete user profile
    if (!user.nickname || !user.avatar) {
      // Need to get additional user profile
      this.promptForUserProfile();
    } else {
      // Complete login
      this.completeLogin(user);
    }
  },

  /**
   * Prompt user for additional profile information
   */
  promptForUserProfile: function() {
    this.setData({
      loadingText: '获取用户信息...'
    });

    wx.showModal({
      title: '完善资料',
      content: '为了给您提供更好的服务，需要获取您的微信头像和昵称',
      confirmText: '授权',
      cancelText: '暂不',
      success: (res) => {
        if (res.confirm) {
          this.getUserProfile();
        } else {
          // User declined, but still complete login with basic info
          const basicUser = auth.getUserInfo() || {};
          this.completeLogin(basicUser);
        }
      },
      fail: () => {
        // Modal failed, complete with basic info
        const basicUser = auth.getUserInfo() || {};
        this.completeLogin(basicUser);
      }
    });
  },

  /**
   * Get user profile using WeChat API
   */
  getUserProfile: function() {
    this.setData({
      loadingText: '获取用户信息...'
    });

    auth.getUserProfile().then((profile) => {
      console.log('Got user profile:', profile);
      
      // Merge profile with existing user info
      const currentUser = auth.getUserInfo() || {};
      const updatedUser = {
        ...currentUser,
        ...profile
      };

      // Update stored user info
      storage.set(auth.AUTH_STORAGE_KEYS.USER_INFO, updatedUser);
      
      this.completeLogin(updatedUser);
      
    }).catch((error) => {
      console.warn('Failed to get user profile:', error);
      
      // Still complete login with basic info
      const basicUser = auth.getUserInfo() || {};
      this.completeLogin(basicUser);
    });
  },

  /**
   * Complete login process
   * @param {Object} user - User information
   */
  completeLogin: function(user) {
    this.setData({
      loading: false,
      isLoggedIn: true,
      userInfo: user,
      errorMessage: '',
      loadingText: '登录成功!'
    });

    // Show success feedback
    wx.showToast({
      title: '登录成功',
      icon: 'success',
      duration: 1500
    });

    // Notify app about login success
    const app = getApp();
    if (app.onUserLogin) {
      app.onUserLogin(user);
    }
  },

  /**
   * Handle login error
   * @param {Error} error - Login error
   */
  handleLoginError: function(error) {
    console.error('Login error:', error);
    
    let errorMessage = '登录失败，请重试';
    
    if (error.message) {
      if (error.message.includes('用户取消')) {
        errorMessage = '登录已取消';
      } else if (error.message.includes('网络')) {
        errorMessage = '网络连接失败，请检查网络';
      } else {
        errorMessage = error.message;
      }
    }

    this.setData({
      loading: false,
      errorMessage: errorMessage,
      loadingText: '正在登录...'
    });

    // Show error toast
    wx.showToast({
      title: errorMessage,
      icon: 'none',
      duration: 2000
    });
  },

  /**
   * Handle logout
   */
  handleLogout: function() {
    auth.logout().then(() => {
      this.setData({
        isLoggedIn: false,
        userInfo: null,
        errorMessage: '',
        showUserProfile: false
      });

      wx.showToast({
        title: '已退出登录',
        icon: 'success',
        duration: 1500
      });

    }).catch((error) => {
      console.error('Logout error:', error);
      wx.showToast({
        title: '退出失败',
        icon: 'none',
        duration: 1500
      });
    });
  },

  /**
   * Refresh user information
   */
  refreshUserInfo: function() {
    const userInfo = auth.getUserInfo();
    if (userInfo && JSON.stringify(userInfo) !== JSON.stringify(this.data.userInfo)) {
      this.setData({
        userInfo: userInfo
      });
    }
  },

  /**
   * Navigate to stories page
   */
  goToStories: function() {
    if (!this.data.isLoggedIn) {
      wx.showToast({
        title: '请先登录',
        icon: 'none',
        duration: 1500
      });
      return;
    }

    wx.switchTab({
      url: '/pages/stories/stories',
      fail: (error) => {
        console.error('Navigation error:', error);
        wx.showToast({
          title: '页面跳转失败',
          icon: 'none',
          duration: 1500
        });
      }
    });
  },

  /**
   * Navigate to device connection
   */
  goToDeviceConnection: function() {
    if (!this.data.isLoggedIn) {
      wx.showToast({
        title: '请先登录',
        icon: 'none',
        duration: 1500
      });
      return;
    }

    // For now, show coming soon message
    wx.showModal({
      title: '设备连接',
      content: '设备连接功能正在开发中，敬请期待！',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  /**
   * Toggle user profile display
   */
  toggleUserProfile: function() {
    this.setData({
      showUserProfile: !this.data.showUserProfile
    });
  },

  /**
   * Handle pull down refresh
   */
  onPullDownRefresh: function() {
    if (this.data.isLoggedIn) {
      this.refreshUserInfo();
      
      // Auto refresh token if needed
      auth.autoRefreshToken().catch((error) => {
        console.warn('Auto refresh failed:', error);
      });
    }

    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 1000);
  },

  /**
   * Handle share app message
   */
  onShareAppMessage: function() {
    return {
      title: 'StorySpark - 智能故事伴侣',
      path: '/pages/index/index',
      imageUrl: '/images/share-image.png'
    };
  },

  /**
   * Handle share timeline
   */
  onShareTimeline: function() {
    return {
      title: 'StorySpark - 智能故事伴侣',
      imageUrl: '/images/share-image.png'
    };
  }
});