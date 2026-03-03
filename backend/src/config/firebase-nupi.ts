import admin from 'firebase-admin';
import { NUPIFacilityRecord, NUPIPatient } from '../patients/patient.types';

// Initialize Firebase Admin SDK for NUPI Registry 
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
    });
}

const db = admin.firestore();

// Helper function to safely extract data from Firestore document
const extractPatientData = (doc: FirebaseFirestore.QueryDocumentSnapshot): NUPIPatient => {
    const data = doc.data();
    return {
        id: doc.id,
        nupi: data.nupi || '',
        firstName: data.firstName,
        lastName: data.lastName,
        middleName: data.middleName,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        nationalId: data.nationalId,
        phoneNumber: data.phoneNumber,
        email: data.email,
        address: data.address,
        demographics: data.demographics,
        facilityId: data.facilityId,
        facilityName: data.facilityName,
        registeredAt: data.registeredAt,
        lastUpdated: data.lastUpdated,
        ...data // Include any other fields
    };
};

export const nupiDb = {
    // Get a patient by NUPI
    async getPatientByNUPI(nupi: string): Promise<NUPIPatient | null> {
        try {
            const patientsRef = db.collection('patient_index');
            const snapshot = await patientsRef
                .where('nupi', '==', nupi)
                .limit(1)
                .get();
            
            if (snapshot.empty) {
                return null;
            }
        
            return extractPatientData(snapshot.docs[0]);
        } catch (error) {
            console.error('Error querying NUPI Registry:', error);
            throw error;
        }
    },

    // Search patients by criteria
    async searchPatients(criteria: { lastName?: string; nationalId?: string }): Promise<NUPIPatient[]> {
        try {
            let query: FirebaseFirestore.Query = db.collection('patient_index');
            
            if (criteria.nationalId) {
                query = query.where('nationalId', '==', criteria.nationalId);
            }
            
            if (criteria.lastName) {
                query = query.where('lastName', '>=', criteria.lastName)
                            .where('lastName', '<=', criteria.lastName + '\uf8ff');
            }
            
            const snapshot = await query.limit(20).get();
            
            return snapshot.docs.map(doc => extractPatientData(doc));
        } catch (error) {
            console.error('Error searching patients:', error);
            return [];
        }
    },

    // Get patient's facility history
    async getPatientFacilities(nupi: string): Promise<NUPIFacilityRecord[]> {
        try {
            const facilitiesRef = db.collection('facility_index');
            const snapshot = await facilitiesRef
                .where('nupi', '==', nupi)
                .get();
        
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as NUPIFacilityRecord[];
        } catch (error) {
            console.error('Error getting patient facilities:', error);
            return [];
        }
    },

    // Register that patient visited Render Hospital
    async registerFacilityVisit(data: {
        nupi: string;
        facilityId: string;
        facilityName: string;
        encounterId: string;
        encounterDate: string;
    }): Promise<boolean> {
        try {
            const { nupi, facilityId, facilityName, encounterId, encounterDate } = data;
            
            const facilitiesRef = db.collection('facility_index');
            const snapshot = await facilitiesRef
                .where('nupi', '==', nupi)
                .where('facilityId', '==', facilityId)
                .limit(1)
                .get();
            
            if (snapshot.empty) {
                // Create new facility record
                await facilitiesRef.add({
                    nupi,
                    facilityId,
                    facilityName,
                    firstVisit: encounterDate,
                    lastVisit: encounterDate,
                    encounterCount: 1,
                    encounters: [{
                        encounterId,
                        encounterDate,
                        facilityId
                    }]
                });
            } else {
                // Update existing record
                const doc = snapshot.docs[0];
                const existingData = doc.data();
                
                await doc.ref.update({
                    lastVisit: encounterDate,
                    encounterCount: (existingData.encounterCount || 0) + 1,
                    encounters: admin.firestore.FieldValue.arrayUnion({
                        encounterId,
                        encounterDate,
                        facilityId
                    })
                });
            }
        
            return true;
        } catch (error) {
            console.error('Error registering facility visit:', error);
            throw error;
        }
    }
};

export { admin };