-- AddForeignKey
ALTER TABLE "EmployeeAiMetrics" ADD CONSTRAINT "EmployeeAiMetrics_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
