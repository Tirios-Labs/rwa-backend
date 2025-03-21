const express = require('express');
const router = express.Router();
const { Onfido, Region } = require('@onfido/api');
const auth = require('../middleware/auth');

// Initialize Onfido client with proper configuration
const onfido = new Onfido({
  apiToken: process.env.ONFIDO_API_TOKEN,
  region: process.env.ONFIDO_REGION === 'US' ? Region.US : Region.EU,
  // Set to true for testing, false for production
  testMode: process.env.NODE_ENV === 'development'
});

// Generate SDK token for frontend
router.post('/token', auth, async (req, res) => {
  try {
    // Create an applicant
    const applicant = await onfido.applicant.create({
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email,
    });

    // Generate SDK token
    const sdkToken = await onfido.sdkToken.generate({
      applicantId: applicant.id,
      referrer: process.env.APP_URL || '*' // Use APP_URL from .env or allow any referrer
    });

    res.json({
      success: true,
      sdkToken: sdkToken.token,
      applicantId: applicant.id,
      verificationId: applicant.id, // Using applicantId as verificationId for clarity
      status: 'INITIALIZED'
    });
  } catch (error) {
    console.error('Onfido token generation error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate SDK token',
      details: error.message 
    });
  }
});

// Handle webhook for verification results
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-sha2-signature'];
   
    // Verify webhook signature
    const isValid = onfido.webhook.verify({
      token: process.env.ONFIDO_WEBHOOK_TOKEN,
      rawBody: JSON.stringify(req.body), // Make sure to use rawBody or stringify the body
      signature: signature
    });

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const { payload } = req.body;
   
    // Handle different webhook events
    switch (payload.resource_type) {
      case 'check':
        if (payload.action === 'check.completed') {
          // Update user verification status in your database
          await updateVerificationStatus(payload);
        }
        break;
    }

    res.status(200).send();
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Get verification status
router.get('/verifications/:verificationId', auth, async (req, res) => {
  try {
    // Using applicantId as verificationId
    const applicantId = req.params.verificationId;
    
    // Get the latest check for this applicant
    const checks = await onfido.check.list({
      applicantId: applicantId
    });
    
    // Get the most recent check
    const latestCheck = checks.checks[0];
    
    let status = 'PENDING';
    if (latestCheck) {
      // Map Onfido status to your app's status
      if (latestCheck.status === 'complete') {
        status = latestCheck.result === 'clear' ? 'APPROVED' : 'REJECTED';
      }
    }
    
    res.json({
      success: true,
      verification: {
        id: applicantId,
        status: status,
        provider: 'onfido',
        details: latestCheck || {}
      }
    });
  } catch (error) {
    console.error('Verification status check error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get verification status'
    });
  }
});

// Initiate verification check
router.post('/init', auth, async (req, res) => {
  try {
    const { level, provider, userData } = req.body;
    
    if (provider !== 'onfido') {
      return res.status(400).json({
        success: false,
        error: 'Unsupported provider'
      });
    }
    
    // Create an applicant
    const applicant = await onfido.applicant.create({
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
    });

    // Generate SDK token
    const sdkToken = await onfido.sdkToken.generate({
      applicantId: applicant.id,
      referrer: process.env.APP_URL || '*'  // Use APP_URL from .env or allow any referrer
    });

    // Store verification data in your database
    // This is where you would link the applicantId to the user account
    
    res.json({
      success: true,
      verificationId: applicant.id,
      status: 'INITIALIZED',
      level: level,
      sdkToken: sdkToken.token
    });
  } catch (error) {
    console.error('Verification initiation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate verification',
      details: error.message
    });
  }
});

// Helper function to update verification status
async function updateVerificationStatus(payload) {
  // Implement your database update logic here
  // This should update the user's verification status based on the check results
  // Example:
  // await User.findOneAndUpdate(
  //   { applicantId: payload.object.applicant_id },
  //   {
  //     kycStatus: payload.object.status,
  //     kycCompletedAt: new Date(),
  //     kycCheckId: payload.object.id
  //   }
  // );
  
  console.log('Updating verification status for applicant:', payload.object.applicant_id);
  // In a real implementation, this would update your database
}

module.exports = router;