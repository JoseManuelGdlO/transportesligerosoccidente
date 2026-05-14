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
  declare trip_id: string;
  declare categoria: "casetas" | "refacciones" | "hospedaje" | "comidas" | "otros";
  declare descripcion: string;
  declare monto: string;
  declare comprobado: boolean;
  declare fecha: Date;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initExpense(sequelize: Sequelize) {
  Expense.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      trip_id: { type: DataTypes.CHAR(36), allowNull: false },
      categoria: {
        type: DataTypes.ENUM("casetas", "refacciones", "hospedaje", "comidas", "otros"),
        allowNull: false,
      },
      descripcion: { type: DataTypes.STRING(512), allowNull: false },
      monto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      comprobado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      fecha: { type: DataTypes.DATE, allowNull: false },
    } as never,
    { sequelize, tableName: "expenses", underscored: true },
  );
}
