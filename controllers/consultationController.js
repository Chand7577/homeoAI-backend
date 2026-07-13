const Consultation = require('../models/Consultation');
const User = require('../models/User');

// Get approved doctors (Admin, Core Team, External Doctor)
exports.getApprovedDoctors = async (req, res) => {
  try {
    const doctors = await User.find({
      role: { $in: ['Admin', 'Core Team', 'External Doctor'] },
      status: 'Approved',
      isActive: true
    })
      .select('name email phone role specialization experience qualifications profilePicture')
      .sort({ role: 1, name: 1 }); // Admin first, then Core Team, then External

    // Format doctors with avatar colors and initials
    const formattedDoctors = doctors.map(doc => ({
      _id: doc._id,
      id: doc._id.toString(),
      name: doc.name,
      email: doc.email,
      phone: doc.phone,
      role: doc.role,
      roleLabel: doc.role === 'Admin' 
        ? 'Admin — Head of Practice' 
        : doc.role === 'Core Team' 
          ? 'Core Team' 
          : 'External Team',
      specialty: doc.specialization || 'General',
      experience: doc.experience || '',
      qualifications: doc.qualifications || '',
      profilePicture: doc.profilePicture || '',
      initials: doc.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2),
      avatarColor: getAvatarColor(doc.name),
      // Mock availability - in real app, you'd have a scheduling system
      availability: 'Available now',
      availType: 'green'
    }));

    res.json({
      success: true,
      doctors: formattedDoctors
    });
  } catch (error) {
    console.error('Get approved doctors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctors'
    });
  }
};

// Helper function to generate avatar color based on name
function getAvatarColor(name) {
  const colors = [
    'bg-emerald-600', 'bg-blue-600', 'bg-indigo-600', 
    'bg-amber-500', 'bg-rose-500', 'bg-slate-600',
    'bg-purple-600', 'bg-teal-600', 'bg-orange-600', 'bg-cyan-600'
  ];
  const index = name.length % colors.length;
  return colors[index];
}

// Create new consultation
exports.createConsultation = async (req, res) => {
  try {
    const {
      patientName,
      patientAge,
      mainConcern,
      severity,
      duration,
      symptomsDescription,
      medications,
      assignedDoctorId,
      assignedDoctorName,
      language,
      attachmentUrl,
      attachmentName,
      attachmentType
    } = req.body;

    // Validate required fields
    if (!patientName || !patientAge || !mainConcern || !severity || !duration || !symptomsDescription || !assignedDoctorId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Verify assigned doctor exists and is approved
    const doctor = await User.findOne({
      _id: assignedDoctorId,
      role: { $in: ['Admin', 'Core Team', 'External Doctor'] },
      status: 'Approved',
      isActive: true
    });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Assigned doctor not found or not approved'
      });
    }

    // Create consultation
    const consultation = await Consultation.create({
      patientName,
      patientAge,
      mainConcern,
      severity,
      duration,
      symptomsDescription,
      medications: medications || '',
      assignedDoctorId,
      assignedDoctorName: assignedDoctorName || doctor.name,
      language: language || 'en',
      attachmentUrl: attachmentUrl || '',
      attachmentName: attachmentName || '',
      attachmentType: attachmentType || '',
      status: 'Pending'
    });

    // Emit socket.io event to assigned doctor
    const io = req.app.get('socketio');
    if (io) {
      const notificationData = {
        id: consultation._id.toString(),
        consultationId: consultation._id,
        patientName: consultation.patientName,
        age: consultation.patientAge,
        assignedDoctorId: consultation.assignedDoctorId.toString(),
        assignedDoctorName: consultation.assignedDoctorName,
        symptoms: [consultation.symptomsDescription],
        fullSymptomText: consultation.symptomsDescription,
        status: 'Pending',
        submittedAt: consultation.submittedAt.toISOString(),
        language: consultation.language
      };

      // Emit ONLY to the specific assigned doctor's room (not broadcast to all)
      io.to(`doctor_${assignedDoctorId}`).emit('new_symptom_submission', notificationData);
      io.to(`doctor_${assignedDoctorId}`).emit('urgent_patient_symptom', notificationData);
    }

    res.status(201).json({
      success: true,
      consultation,
      message: 'Consultation submitted successfully'
    });
  } catch (error) {
    console.error('Create consultation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create consultation'
    });
  }
};

// Get all consultations (for doctors)
exports.getConsultations = async (req, res) => {
  try {
    const { doctorId, status, search, page = 1, limit = 20 } = req.query;

    const query = {};

    // Filter by assigned doctor if provided
    if (doctorId) {
      query.assignedDoctorId = doctorId;
    }

    // Filter by status if provided
    if (status && status !== 'all') {
      query.status = status;
    }

    // Search by patient name or symptoms
    if (search) {
      query.$or = [
        { patientName: { $regex: search, $options: 'i' } },
        { symptomsDescription: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const consultations = await Consultation.find(query)
      .populate('assignedDoctorId', 'name email phone role')
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Consultation.countDocuments(query);

    res.json({
      success: true,
      consultations,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Get consultations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch consultations'
    });
  }
};

// Get single consultation by ID
exports.getConsultation = async (req, res) => {
  try {
    const consultation = await Consultation.findById(req.params.id)
      .populate('assignedDoctorId', 'name email phone role specialization')
      .populate('analysisId');

    if (!consultation) {
      return res.status(404).json({
        success: false,
        message: 'Consultation not found'
      });
    }

    res.json({
      success: true,
      consultation
    });
  } catch (error) {
    console.error('Get consultation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch consultation'
    });
  }
};

// Update consultation status
exports.updateConsultation = async (req, res) => {
  try {
    const { status, doctorNotes, analysisId } = req.body;

    const updates = {};
    if (status) updates.status = status;
    if (doctorNotes !== undefined) updates.doctorNotes = doctorNotes;
    if (analysisId) updates.analysisId = analysisId;

    // Set timestamp based on status
    if (status === 'Analyzed') {
      updates.analyzedAt = new Date();
    } else if (status === 'Completed') {
      updates.completedAt = new Date();
    }

    const consultation = await Consultation.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).populate('assignedDoctorId', 'name email phone role');

    if (!consultation) {
      return res.status(404).json({
        success: false,
        message: 'Consultation not found'
      });
    }

    res.json({
      success: true,
      consultation,
      message: 'Consultation updated successfully'
    });
  } catch (error) {
    console.error('Update consultation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update consultation'
    });
  }
};

// Delete consultation
exports.deleteConsultation = async (req, res) => {
  try {
    const consultation = await Consultation.findByIdAndDelete(req.params.id);

    if (!consultation) {
      return res.status(404).json({
        success: false,
        message: 'Consultation not found'
      });
    }

    res.json({
      success: true,
      message: 'Consultation deleted successfully'
    });
  } catch (error) {
    console.error('Delete consultation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete consultation'
    });
  }
};
