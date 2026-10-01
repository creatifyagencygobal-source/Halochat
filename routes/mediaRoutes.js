const express=require('express');const rateLimit=require('express-rate-limit');
const {requireAuth}=require('../middleware/authMiddleware');const {requireConversationMember}=require('../middleware/conversationMiddleware');
const {mediaUpload,validateMediaFiles,uploadErrorHandler}=require('../middleware/uploadMiddleware');const {uploadAttachments,recordDownload}=require('../controllers/mediaController');
const router=express.Router();const limiter=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-7',legacyHeaders:false,message:{success:false,message:'Too many media requests. Please try again later.'}});
router.post('/conversations/:conversationId',requireAuth,limiter,requireConversationMember,mediaUpload,validateMediaFiles,uploadAttachments,uploadErrorHandler);
router.post('/messages/:messageId/attachments/:index/download',requireAuth,limiter,recordDownload);
module.exports=router;
