import { StaffFormError } from "../../lib/staff-form-feedback";

export class ContentError extends StaffFormError {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
