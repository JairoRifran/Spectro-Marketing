# Approval engine

Risk is low, medium, or high; autonomy is 0 observer, 1 creator, 2 operator, 3 autonomous. Medium risk requires approval below level 3. High risk always requires approval.

Approvals move only from requested to approved, rejected, or expired. The database records actor and timestamp. Approval queues held work; rejection/expiration cancels it. One open approval per task is enforced. A prompt cannot change these rules.
