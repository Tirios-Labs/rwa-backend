const { DefaultApi, Configuration, Region } = require('@onfido/api');

// Initialize the Onfido client
const onfidoClient = new DefaultApi(
  new Configuration({
    apiToken: process.env.ONFIDO_API_TOKEN || 'api_sandbox_us.yOymsT0YSl7.CTXdio3YsBNekcbtrowbHTovwDrPpEEm',
    region: Region.US  // Using Region.US enum for US region
  })
);

const WORKFLOW_ID = '5a8001d1-d61c-493c-bab2-003372d08042';

const kycController = {
  // Initialize verification and create applicant
  async initVerification(req, res) {
    try {
      // Log request for debugging
      console.log('Initializing verification for:', req.body);
      
      const { firstName, lastName, email } = req.body;
      
      // Validate required fields
      if (!firstName || !lastName || !email) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'First name, last name, and email are required'
        });
      }
  
      // Create an Onfido applicant with better error handling
      let applicant;
      try {
        applicant = (await onfidoClient.createApplicant({
          first_name: firstName,
          last_name: lastName,
          email: email
        })).data;
        
        console.log('Applicant created:', applicant);
      } catch (error) {
        console.error('Onfido applicant creation error:', error.response?.data || error.message);
        return res.status(422).json({
          error: 'Applicant creation failed',
          details: error.response?.data?.error?.message || error.message
        });
      }
  
      // Create workflow run with better error handling
      let workflowRun;
      try {
        workflowRun = (await onfidoClient.createWorkflowRun({
          workflow_id: WORKFLOW_ID,
          applicant_id: applicant.id
        })).data;
        
        console.log('Workflow run created:', workflowRun);
      } catch (error) {
        console.error('Workflow run creation error:', error.response?.data || error.message);
        return res.status(422).json({
          error: 'Workflow run creation failed',
          details: error.response?.data?.error?.message || error.message
        });
      }
  
      // Generate SDK token with better error handling
      let sdkToken;
      try {
        sdkToken = (await onfidoClient.generateSdkToken({
          applicant_id: applicant.id,
          referrer: '*'  // Allow any referrer for development
        })).data;
        
        console.log('SDK token generated successfully');
      } catch (error) {
        console.error('SDK token generation error:', error.response?.data || error.message);
        return res.status(422).json({
          error: 'SDK token generation failed',
          details: error.response?.data?.error?.message || error.message
        });
      }
  
      // Send all required data back to the client
      res.json({
        success: true,
        sdkToken: sdkToken.token,
        applicantId: applicant.id,
        workflowRunId: workflowRun.id,
        // Include additional data that might be useful for the frontend
        applicantData: {
          firstName: applicant.first_name,
          lastName: applicant.last_name,
          email: applicant.email
        }
      });
    } catch (error) {
      console.error('Error initializing verification:', error);
      res.status(500).json({ 
        error: 'Failed to initialize verification',
        details: error.message 
      });
    }
  },
  // Get verification status
  async getVerificationStatus(req, res) {
    try {
      const { verificationId } = req.params;

      // Get workflow run status
      const workflowRuns = (await onfidoClient.listWorkflowRuns({
        applicant_id: verificationId,
        page: 1,
        per_page: 1 // Getting just the latest workflow run
      })).data;

      const latestRun = workflowRuns.items[0];

      if (!latestRun) {
        return res.json({ 
          status: 'pending', 
          message: 'No verification workflow found' 
        });
      }

      res.json({
        status: latestRun.status,
        output: latestRun.output,
        completedAt: latestRun.updated_at,
        workflowRunId: latestRun.id
      });
    } catch (error) {
      console.error('Error getting verification status:', error);
      res.status(500).json({ 
        error: 'Failed to get verification status',
        details: error.message 
      });
    }
  },

  // Webhook handler for Onfido events
  async handleWebhook(req, res) {
    try {
      const webhookToken = process.env.ONFIDO_WEBHOOK_TOKEN || '2uc70ckWmIYtWiJndMVqt7hR8DKthqJG';
      const signature = req.headers['x-sha2-signature'];
      
      // Get raw body as string (assuming express.raw() middleware is used)
      const rawBody = req.body.toString('utf8');
      
      // Verify webhook signature
      const WebhookEventVerifier = require('@onfido/api').WebhookEventVerifier;
      const verifier = new WebhookEventVerifier(webhookToken);
      
      try {
        // Verify the webhook
        verifier.readPayload(rawBody, signature);
      } catch (error) {
        console.error('Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }

      // Parse the raw body
      const webhookData = JSON.parse(rawBody);
      const { payload } = webhookData;

      console.log('Received webhook:', {
        resourceType: payload.resource_type,
        action: payload.action,
        status: payload.object?.status,
        completedAt: payload.object?.completed_at_iso8601
      });

      if (payload.resource_type === 'workflow_run' && payload.action === 'workflow_run.completed') {
        const workflowRun = payload.object;
        
        // Update user's verification status in your database
        // await User.updateOne(
        //   { onfidoApplicantId: workflowRun.applicant_id },
        //   { 
        //     kycStatus: workflowRun.status,
        //     kycCompletedAt: workflowRun.completed_at_iso8601,
        //     kycWorkflowRunId: workflowRun.id
        //   }
        // );

        console.log('Workflow completed:', {
          workflowRunId: workflowRun.id,
          applicantId: workflowRun.applicant_id,
          status: workflowRun.status,
          completedAt: workflowRun.completed_at_iso8601
        });
      }

      res.json({ 
        received: true,
        message: 'Webhook processed successfully'
      });
    } catch (error) {
      console.error('Error handling webhook:', error);
      res.status(500).json({ 
        error: 'Failed to handle webhook',
        details: error.message 
      });
    }
  },

  // Get all verifications for a user
  async getUserVerifications(req, res) {
    try {
      // Get the user's applicant ID from their profile or session
      const applicantId = req.user.onfidoApplicantId;
      
      if (!applicantId) {
        return res.json({ verifications: [] }); // Return empty if user hasn't started KYC
      }

      // Get all workflow runs for the applicant
      const workflowRuns = (await onfidoClient.listWorkflowRuns({
        applicant_id: applicantId,
        page: 1,
        per_page: 10 // Adjust as needed
      })).data;

      const verifications = workflowRuns.items.map(run => ({
        id: run.id,
        status: run.status,
        completedAt: run.completed_at_iso8601,
        output: run.output
      }));

      res.json({ verifications });
    } catch (error) {
      console.error('Error getting user verifications:', error);
      res.status(500).json({ 
        error: 'Failed to get user verifications',
        details: error.message 
      });
    }
  }
};

module.exports = kycController;