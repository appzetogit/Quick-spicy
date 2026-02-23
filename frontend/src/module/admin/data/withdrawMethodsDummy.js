// Dummy data for Withdraw Methods
export const withdrawMethodsDummy = [
  {
    sl: 1,
    paymentMethodName: "Card",
    methodFields: [
      {
        name: "Account name",
        type: "String",
        placeholder: "Enter your card holder name",
        required: true,
      },
      {
        name: "Account number",
        type: "Number",
        placeholder: "Enter your account number",
        required: true,
      },
      {
        name: "Email",
        type: "Email",
        placeholder: "Enter your account email",
        required: false,
      },
    ],
    activeStatus: true,
    defaultMethod: false,
  },
  {
    sl: 2,
    paymentMethodName: "6cash",
    methodFields: [
      {
        name: "Account name",
        type: "String",
        placeholder: "Enter your account name",
        required: true,
      },
      {
        name: "Account number",
        type: "Number",
        placeholder: "Enter your account number",
        required: true,
      },
    ],
    activeStatus: true,
    defaultMethod: true,
  },
]


