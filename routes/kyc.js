/**
 * Generate a zero-knowledge proof from KYC verification
 */
router.post('/proof/:verificationId', authenticateJWT, async (req, res) => {
    try {
      const { verificationId } = req.params;
      const userId = req.user.id;
      
      // Initialize KYC service
      const db = req.app.get('db');
      const redis = req.app.get('redis');
      const kycService = new KYCService(db, redis);
      
      // Generate the proof
      const proofResult = await kycService.generateKycProof(userId, verificationId);
      
      res.status(200).json({
        success: true,
        proofId: proofResult.proofId,
        publicInputs: proofResult.publicInputs,
        message: 'Zero-knowledge proof generated successfully'
      });
    } catch (error) {
      console.error('Error generating KYC proof:', error);
      res.status(500).json({
        success: false,
        message: `Failed to generate proof: ${error.message}`
      });
    }
  });