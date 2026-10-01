const { findAuthorizedConversation } = require('../utils/conversationHelpers');
async function requireConversationMember(req,res,next){try{const conversation=await findAuthorizedConversation(req.params.conversationId,req.userId,false);if(!conversation)return res.status(404).json({success:false,message:'Conversation not found.'});req.conversation=conversation;next();}catch(error){next(error);}}
module.exports={requireConversationMember};
