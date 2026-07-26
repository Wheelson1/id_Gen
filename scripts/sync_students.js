import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import csv from 'csv-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
// IMPORTANT: You must use the SERVICE_ROLE_KEY here to bypass email verification
// DO NOT expose this key to the frontend client!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Error: Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const CSV_FILE_PATH = path.join(__dirname, 'students_data.csv');
const BATCH_SIZE = 500;
const currentYear = new Date().getFullYear();

async function processStudents() {
  if (!fs.existsSync(CSV_FILE_PATH)) {
    console.error(`Error: CSV file not found at ${CSV_FILE_PATH}`);
    console.log("Please create this file with headers: jamb_no, full_name, department, faculty, fees_paid, school_reg_no");
    return;
  }

  let batch = [];
  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;
  const failedRecords = [];

  console.log("Starting sync to Supabase...");
  
  const readStream = fs.createReadStream(CSV_FILE_PATH).pipe(csv());

  for await (const row of readStream) {
    if (row.jamb_no && row.full_name) {
      batch.push(row);
      
      if (batch.length >= BATCH_SIZE) {
        readStream.pause();
        const results = await syncBatch(batch);
        processedCount += batch.length;
        successCount += results.success;
        errorCount += results.error;
        failedRecords.push(...results.failed);
        console.log(`Processed ${processedCount} records...`);
        batch = [];
        await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting pause
        readStream.resume();
      }
    }
  }

  // Process remaining records in the last batch
  if (batch.length > 0) {
    const results = await syncBatch(batch);
    processedCount += batch.length;
    successCount += results.success;
    errorCount += results.error;
    failedRecords.push(...results.failed);
    console.log(`Processed ${processedCount} records...`);
  }

  console.log("-----------------------------------------");
  console.log("Sync Complete!");
  console.log(`Total Processed: ${processedCount}`);
  console.log(`Successfully synced: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  
  if (failedRecords.length > 0) {
    console.log("\nFailed Records:");
    console.log(failedRecords.map(r => r.jamb_no).join(', '));
  }
  console.log("-----------------------------------------");
}

async function syncBatch(batch) {
  let success = 0;
  let error = 0;
  let failed = [];

  await Promise.all(batch.map(async (student) => {
    try {
      const dummyEmail = `${student.jamb_no.toLowerCase()}@ebsu.edu.ng`;
      const password = student.jamb_no; // Using JAMB No as default password
      
      // Parse fees_paid boolean
      const isFeesPaid = String(student.fees_paid).toLowerCase() === 'true';
      const schoolRegNo = student.school_reg_no || null;
      const now = new Date().toISOString();

      // 1. Create user in Supabase Auth using Admin API
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: dummyEmail,
        password: password,
        email_confirm: true,
        user_metadata: { role: 'student' }
      });

      if (authError) {
        // If user already exists, update their record in the students table
        if (authError.message.includes('already registered') || authError.status === 422 || authError.code === 'user_already_exists') {
           const { error: updateError } = await supabase
            .from('students')
            .update({
              fees_paid: isFeesPaid,
              school_reg_no: schoolRegNo,
              last_synced_at: now,
              jamb_year: currentYear
            })
            .eq('jamb_no', student.jamb_no);
            
            if (updateError) {
              console.error(`Error updating existing record ${student.jamb_no}:`, updateError.message);
              error++;
              failed.push(student);
            } else {
              success++;
            }
        } else {
          console.error(`Error creating auth user for ${student.jamb_no}:`, authError.message);
          error++;
          failed.push(student);
        }
      } else {
        const userId = authData.user.id;
        
        // 2. Insert new record into the public.students table
        const { error: dbError } = await supabase
          .from('students')
          .insert({
            id: userId,
            jamb_no: student.jamb_no,
            full_name: student.full_name,
            department: student.department || '',
            faculty: student.faculty || '',
            linked_email: dummyEmail,
            fees_paid: isFeesPaid,
            school_reg_no: schoolRegNo,
            last_synced_at: now,
            jamb_year: currentYear
          });

        if (dbError) {
          console.error(`Error inserting new record ${student.jamb_no}:`, dbError.message);
          error++;
          failed.push(student);
        } else {
          success++;
        }
      }
    } catch (err) {
      console.error(`Unexpected error processing ${student.jamb_no}:`, err.message);
      error++;
      failed.push(student);
    }
  }));

  return { success, error, failed };
}

processStudents();
