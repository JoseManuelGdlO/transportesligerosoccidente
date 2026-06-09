import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class Expense extends Model<InferAttributes<Expense>, InferCreationAttributes<Expense>> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare trip_id: string;
  declare categoria: "casetas" | "refacciones" | "hospedaje" | "comidas" | "otros";
  declare tipo: "gasto" | "ingreso";
  declare descripcion: string;
  declare monto: string;
  declare monto_comprobado: string;
  declare visible_en_liquidacion: boolean;
  declare fecha: Date;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initExpense(sequelize: Sequelize) {
  Expense.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      trip_id: { type: DataTypes.CHAR(36), allowNull: false },
      categoria: {
        type: DataTypes.ENUM("casetas", "refacciones", "hospedaje", "comidas", "otros"),
        allowNull: false,
      },
      tipo: {
        type: DataTypes.ENUM("gasto", "ingreso"),
        allowNull: false,
        defaultValue: "gasto",
      },
      descripcion: { type: DataTypes.STRING(512), allowNull: false },
      monto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      monto_comprobado: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      visible_en_liquidacion: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      fecha: { type: DataTypes.DATE, allowNull: false },
    } as never,
    { sequelize, tableName: "expenses", underscored: true },
  );
}
