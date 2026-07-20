import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class AccountDocumentPayment extends Model<
  InferAttributes<AccountDocumentPayment>,
  InferCreationAttributes<AccountDocumentPayment>
> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare document_id: string;
  declare monto: string;
  declare fecha: string;
  declare nota: CreationOptional<string | null>;
  declare created_by: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initAccountDocumentPayment(sequelize: Sequelize) {
  AccountDocumentPayment.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      document_id: { type: DataTypes.CHAR(36), allowNull: false },
      monto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      fecha: { type: DataTypes.DATEONLY, allowNull: false },
      nota: { type: DataTypes.STRING(512), allowNull: true },
      created_by: { type: DataTypes.CHAR(36), allowNull: true },
    } as never,
    { sequelize, tableName: "account_document_payments", underscored: true },
  );
}
