import { notFound } from "next/navigation";

/**
 * Demo focus pass: the admin Employees UI is hidden, so /employees 404s.
 * features/employees/** and services/employees.service.ts stay in the repo
 * (attendance dialogs use the service). The /employee/* portal is separate.
 */
export default function EmployeesLayout() {
  notFound();
}
